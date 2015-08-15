var tape = require('tape')
var mmm = require('../')
var level = require('level-test')('multi-master-merge')

var create = function() {
  return mmm(level(), {encoding:'json'})
}

tape('put + get', function(t) {
  var db = create()

  db.put('hello', {hello:'world'}, function(err) {
    t.ok(!err, 'no err')
    db.get('hello', function(err, docs) {
      t.ok(!err, 'no err')
      t.same(docs.length, 1)
      t.same(docs[0].value.hello, 'world')
      t.end()
    })
  })
})

tape('put + get twice', function(t) {
  var db = create()

  db.put('hello', {hello:'old world'}, function(err) {
    db.put('hello', {hello:'world'}, function(err) {
      t.ok(!err, 'no err')
      db.get('hello', function(err, docs) {
        t.ok(!err, 'no err')
        t.same(docs.length, 1)
        t.same(docs[0].value.hello, 'world')
        t.end()
      })
    })
  })
})

tape('read stream', function(t) {
  var db = create()

  db.put('hello', {hello: 'world'}, function(err) {
    t.notOk(err)
    db.put('hej', {hej: 'verden'}, function(err) {
      t.notOk(err)

      var i = 0
      var strm = db.createReadStream()
      strm.on('data', function(dta) {
        if (++i === 1) {
          t.equal(dta.value.hej, 'verden')
          t.equal(dta.key, 'hej')
        } else {
          t.equal(dta.value.hello, 'world')
          t.equal(dta.key, 'hello')
        }
      })
      strm.on('end', function() {
        t.end()
      })
    })
  })
})

tape('value stream', function(t) {
  var db = create()

  db.put('hello', {hello: 'world'}, function(err) {
    t.notOk(err)
    db.put('hej', {hej: 'verden'}, function(err) {
      t.notOk(err)

      var i = 0
      var strm = db.createValueStream()
      strm.on('data', function(dta) {
        if (++i === 1) {
          t.equal(dta[0].hej, 'verden')
        } else {
          t.equal(dta[0].hello, 'world')
        }
      })
      strm.on('end', function() {
        t.end()
      })
    })
  })
})

tape('key stream', function(t) {
  var db = create()

  db.put('hello', {hello: 'world'}, function(err) {
    t.notOk(err)
    db.put('hej', {hej: 'verden'}, function(err) {
      t.notOk(err)

      var i = 0
      var strm = db.createKeyStream()
      strm.on('data', function(dta) {
        if (++i === 1) {
          t.equal(dta, 'hej')
        } else {
          t.equal(dta, 'hello')
        }
      })
      strm.on('end', function() {
        t.end()
      })
    })
  })
})

tape('postupdate', function (t) {
  var postupdate = function (data, cb) {
    t.same(data.key, 'hello')
    t.same(data.value, 'world')
    cb(null, data)
  }

  var db = mmm(level(), {encoding:'json', postupdate: postupdate})
  db.put('hello', 'world', function () {
    t.end()
  })
})