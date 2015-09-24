var scuttleup = require('scuttleup')
var fwdb = require('fwdb')
var through = require('through2')
var sublevel = require('level-sublevel')
var after = require('after-all')
var concat = require('concat-stream')
var protobuf = require('protocol-buffers')
var fs = require('fs')
var encoders = require('./encoders')

var messages = protobuf(fs.readFileSync(__dirname + '/schema.proto'))

var split = function (id) {
  var i = id.lastIndexOf('@')
  var peer = id.slice(0, i)
  var seq = Number(id.slice(i + 1))

  return [peer, seq]
}

var toHead = function (data) {
  return {peer: data.key, seq: Number(data.value)}
}

var next = function (data, cb) {
  cb()
}

var link = function (a, b) {
  b.on('close', function () {
    a.destroy()
  })
  a.on('error', function (err) {
    b.emit('error', err)
  })
  return a.pipe(b)
}

var create = function (db, opts) {
  if (!opts) opts = {}

  var subs = sublevel(db)
  var seqs = subs.sublevel('seqs')
  var log = scuttleup(subs.sublevel('log'), {id: opts.id})
  var fdb = fwdb(db) // sublevel blows up if we pass in a sublevel :(

  var preupdate = opts.preupdate || next
  var postupdate = opts.postupdate || next
  var enc = encoders(opts.valueEncoding || opts.encoding)

  var head = 0
  var cbs = {}
  var call = function () {
    if (cbs[head]) cbs[head]()
    delete cbs[head]
  }

  var index = function (data, _, cb) {
    var entry = messages.Entry.decode(data.entry)
    var key = entry.key
    var d = postupdate !== next || preupdate !== next ? {peer: data.peer, seq: data.seq, key: key, value: enc.decode(entry.value)} : null

    preupdate(d, function (err) {
      if (err) return cb(err)

      fdb.heads(key, function (err, heads) {
        if (err) return cb(err)
        if (!heads) heads = []

        heads = heads
          .filter(function (h) {
            var parts = split(h.hash)
            return parts[0] === data.peer
          })
          .map(function (m) {
            return m.hash
          })

        if (entry.prev) heads = heads.concat(entry.prev)

        fdb.create({
          key: key,
          hash: data.peer + '@' + data.seq,
          prev: heads
        }, function (err) {
          if (err) return cb(err)
          seqs.put(data.peer, '' + data.seq, function () {
            postupdate(d, function (err) {
              if (data.peer === log.id) call(head = data.seq)
              cb(err)
            })
          })
        })
      })
    })
  }

  seqs.createReadStream().pipe(concat(function (head) {
    log.createReadStream({live: true, since: head.map(toHead)}).pipe(through.obj(index))
  }))

  var that = {}

  that.fwdb = fdb
  that.log = log
  that.db = db

  that.sync = function (opts) {
    return log.createReplicationStream(opts)
  }

  that.replicate = function (other, opts) {
    var tmp = other.sync()
    tmp.pipe(that.sync(opts)).pipe(tmp)
    return other
  }

  that.merge = function (key, list, val, cb) {
    var prev = [].concat(list).map(function (doc) {
      return doc.peer + '@' + doc.seq
    })

    that.put(key, val, {prev: prev}, cb)
  }

  that.createKeyStream = function (opts) {
    var keys = fdb.keys(opts)
    var fmt = through.obj(function (data, enc, cb) {
      cb(null, data.key)
    })
    return link(keys, fmt)
  }

  that.createValueStream = function (opts) {
    var keys = fdb.keys(opts)
    var fmt = through.obj(function (data, enc, cb) {
      that.get(data.key, opts, function (err, docs) {
        if (err) return cb(err)
        cb(null, docs.map(function (x) {
          return x.value
        }))
      })
    })
    return link(keys, fmt)
  }

  that.createReadStream = function (opts) {
    var combine = opts && opts.combine
    var keys = fdb.keys(opts)
    var fmt = through.obj(function (data, enc, cb) {
      that.get(data.key, opts, function (err, docs) {
        if (err) return cb(err)
        if (combine) return cb(null, docs)
        for (var i = 0; i < docs.length; i++) fmt.push(docs[i])
        cb()
      })
    })
    return link(keys, fmt)
  }

  that.createLogStream = function (opts) {
    if (!opts) opts = {}
    var e = opts.encoding ? encoders(opts.encoding) : enc

    var stream = log.createReadStream({ valueEncoding: 'binary', live: opts.live })
    var fmt = through.obj(function (data, enc, cb) {
      var entry = messages.Entry.decode(data.entry)
      cb(null, { key: entry.key, value: e.decode(entry.value) })
    })
    return link(stream, fmt)
  }

  that.put = function (key, val, opts, cb) {
    if (typeof opts === 'function') return that.put(key, val, null, opts)
    if (!opts) opts = {}

    var prev = [].concat(opts.prev || [])
    var e = opts.encoding ? encoders(opts.encoding) : enc

    log.append(messages.Entry.encode({key: key, value: e.encode(val), prev: prev}), cb && function (err, change) {
      if (err) return cb(err)
      var inserted = {peer: change.peer, seq: change.seq, key: key, value: val}
      if (head >= change.seq) return cb(null, inserted)
      cbs[change.seq] = function () { cb(null, inserted) }
    })
  }

  that.get = function (key, opts, cb) {
    if (typeof opts === 'function') return that.get(key, null, opts)
    if (!opts) opts = {}

    var e = opts.encoding ? encoders(opts.encoding) : enc

    fdb.heads(key, function (err, heads) {
      if (err) return cb(err)

      var list = []
      var next = after(function (err) {
        if (err) return cb(err)
        cb(null, list)
      })

      heads.forEach(function (val) {
        var n = next()
        var parts = split(val.hash)

        if (opts.data === false) {
          list.push({peer: parts[0], seq: parts[1], key: key})
          return n()
        }

        log.entry(parts[0], parts[1], function (err, entry) {
          if (err) return n(err)

          entry = messages.Entry.decode(entry)
          list.push({
            peer: parts[0],
            seq: parts[1],
            key: key,
            value: e.decode(entry.value)
          })

          n()
        })
      })
    })
  }

  return that
}

module.exports = create
