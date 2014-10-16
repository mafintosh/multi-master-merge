var tape = require('tape')
var mmm = require('../')
var level = require('level-test')('multi-master-merge')

var create = function() {
  return mmm(level())
}

tape('put + get', function(t) {
  var db = create()

  db.put('hello', {hello:'world'}, function(err) {
    t.ok(!err, 'no err')
    db.get('hello', function(err, docs) {
      t.ok(!err, 'no err')
      t.same(docs.length, 1)
      t.same(docs[0].hello, 'world')
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
        t.same(docs[0].hello, 'world')
        t.end()
      })
    })
  })
})