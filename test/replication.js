var mmm = require('../')
var tape = require('tape')
var level = require('level-test')('replication')

var create = function(name) {
  return mmm(level(name))
}

var replicate = function(a, b) {
  var s1 = a.sync()
  var s2 = b.sync()

  s1.pipe(s2).pipe(s1)
}

tape('a to b', function(t) {
  var a = create('a.1')
  var b = create('b.1')

  replicate(a, b)

  a.put('hello', {hello:'a'}, function() {
    setTimeout(function() {
      b.get('hello', function(err, docs) {
        t.same(docs.length, 1)
        t.same(docs[0].hello, 'a')
        t.end()
      })
    }, 200)
  })
})

tape('a to b multi update', function(t) {
  var a = create('a.2')
  var b = create('b.2')

  replicate(a, b)

  a.put('hello', {hello:'a'}, function() {
    b.put('hello', {hello:'b'}, function() {
      setTimeout(function() {
        b.get('hello', function(err, docs) {
          t.same(docs.length, 2)
          t.same([docs[0].hello, docs[1].hello].sort(), ['a', 'b'])
          t.end()
        })
      }, 200)
    })
  })
})

tape('a to b multi update + merge', function(t) {
  var a = create('a.3')
  var b = create('b.3')

  replicate(a, b)

  a.put('hello', {hello:'a'}, function() {
    b.put('hello', {hello:'b'}, function() {
      setTimeout(function() {
        b.get('hello', function(err, docs) {
          t.same(docs.length, 2)
          b.merge('hello', docs, {hello:'a + b'}, function() {
            b.get('hello', function(err, docs) {
              t.same(docs.length, 1)
              t.same(docs[0].hello, 'a + b')
              t.end()
            })
          })
        })
      }, 200)
    })
  })
})

tape('a to b multi update + merge + replicate', function(t) {
  var a = create('a.4')
  var b = create('b.4')

  replicate(a, b)

  a.put('hello', {hello:'a'}, function() {
    b.put('hello', {hello:'b'}, function() {
      setTimeout(function() {
        b.get('hello', function(err, docs) {
          b.merge('hello', docs, {hello:'a + b'}, function() {
            setTimeout(function() {
              a.get('hello', function(err, docs) {
                t.same(docs.length, 1)
                t.same(docs[0].hello, 'a + b')
                t.end()
              })
            }, 200)
          })
        })
      }, 200)
    })
  })
})