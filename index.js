var scuttleup = require('scuttleup')
var fwdb = require('fwdb')
var through = require('through2')
var sublevel = require('level-sublevel')
var after = require('after-all')
var concat = require('concat-stream')
var protobuf = require('protocol-buffers')
var fs = require('fs')

var messages = protobuf(fs.readFileSync(__dirname+'/schema.proto'))

var split = function(id) {
  var i = id.lastIndexOf('@')
  var peer = id.slice(0, i)
  var seq = Number(id.slice(i+1))

  return [peer, seq]
}

var toHead = function(data) {
  return {peer:data.key, seq:Number(data.value)}
}

var create = function(db, opts) {
  var subs = sublevel(db)

  var latest = subs.sublevel('latest')
  var seqs = subs.sublevel('seqs')
  var log = scuttleup(subs.sublevel('log'), opts)
  var fdb = fwdb(db) // sublevel blows up if we pass in a sublevel :(

  var head = 0
  var cbs = {}
  var call = function() {
    if (cbs[head]) cbs[head]()
    delete cbs[head]
  }

  var index = function(data, enc, cb) {
    var entry = messages.Entry.decode(data.entry)
    var id = data.peer+'@'+data.seq
    var key = entry.key

    fdb.heads(key, function(err, heads) {
      if (err) return cb(err)
      if (!heads) heads = []

      heads = heads
        .filter(function(h) {
          var parts = split(h.hash)
          return parts[0] === data.peer
        })
        .map(function(m) {
          return m.hash
        })

      if (entry.prev) heads = heads.concat(entry.prev)

      fdb.create({
        key: key,
        hash: id,
        prev: heads
      }, function(err) {
        seqs.put(data.peer, ''+data.seq, function() {
          if (data.peer === log.id) call(head = data.seq)
          cb(err)
        })
      })
    })

  }

  seqs.createReadStream().pipe(concat(function(head) {
    log.createReadStream({live:true, since:head.map(toHead)}).pipe(through.obj(index))
  }))

  var that = {}

  that.fwdb = fdb
  that.log = log
  that.db = db

  that.sync = function(opts) {
    return log.createReplicationStream(opts)
  }

  that.replicate = function(other, opts) {
    var tmp = other.sync()
    tmp.pipe(that.sync(opts)).pipe(tmp)
    return other
  }

  that.merge = function(key, list, val, cb) {
    var prev = [].concat(list).map(function(doc) {
      return doc._id
    })

    that.put(key, val, {prev:prev}, cb)
  }

  that.put = function(key, val, opts, cb) {
    if (typeof opts === 'function') return that.put(key, val, null, opts)
    if (!opts) opts = {}
    if (typeof val !== 'object') val = {data:val}

    var value = JSON.stringify(val)
    var prev = [].concat(opts.prev || [])

    log.append(messages.Entry.encode({key:key, value:value, prev:prev}), cb && function(err, change) {
      if (err) return cb(err)
      val._id = change.peer+'@'+change.seq
      if (head >= change.seq) return cb(null, val)
      cbs[change.seq] = function() { cb(null, val) }
    })
  }

  that.get = function(key, cb) {
    fdb.heads(key, function(err, heads) {
      if (err) return cb(err)

      var list = []
      var next = after(function(err) {
        if (err) return cb(err)
        cb(null, list)
      })

      heads.forEach(function(val) {
        var n = next()
        var parts = split(val.hash)

        log.entry(parts[0], parts[1], function(err, entry) {
          if (err) return n(err)

          entry = messages.Entry.decode(entry)
          var value = JSON.parse(entry.value)
          value._id = val.hash
          list.push(value)
          n()
        })
      })
    })
  }

  return that
}

module.exports = create