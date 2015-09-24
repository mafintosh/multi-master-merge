# multi-master-merge

A database with multi master replication and merge support
based on [leveldb](https://github.com/rvagg/node-levelup), [fwdb](https://github.com/substack/fwdb) and [scuttleup](https://github.com/mafintosh/scuttleup)

```
npm install multi-master-merge
```

[![build status](http://img.shields.io/travis/mafintosh/multi-master-merge.svg?style=flat)](http://travis-ci.org/mafintosh/multi-master-merge)

## Usage

``` js
var mmm = require('multi-master-merge')
var level = require('level')

var mdb = mmm(level('data.db'), {encoding:'utf-8'})

mdb.put('hello', 'world', function(err, doc) {
  console.log('Inserted:', doc)
  mdb.get('hello', function(err, docs) {
    console.log('"hello" contains the following:', docs)
  })
})
```

When you do `mdb.get(key, cb)` you will always get an array of documents back.
The reason for this is to support multi master replication which means
that we might have multiple values for a given key.

## Replication

To replicate your database simply open a `sync` stream and pipe it to another
database

``` js
// a and b are two database instances
var s1 = a.sync() // open a sync stream for db a
var s2 = b.sync() // open a sync stream for db b

s1.pipe(s2).pipe(s1) // pipe them together to start replicating
```

Updates will now be replicated between the two instances.
If two databases inserts a document on the same key both of them will be
present if you do a `mdb.get(key)`

``` js
a.put('hello', 'a')
b.put('hello', 'b')

setTimeout(function() {
  a.get('hello', function(err, docs) {
    console.log(docs) // will print [{peer:..., value:'a'}, {peer:..., value:'b'}]
  })
}, 1000) // wait a bit for the inserts to replicate
```

## Merging

To combine multiple documents into a single one use `mdb.merge(key, docs, newValue)`
If we consider the above replication scenario we have two documents for the key `hello`

``` js
a.get('hello', function(err, docs) {
  console.log(docs) // will print [{peer:..., value:'a'}, {peer:..., value:'b'}]
})
```

To merge them into a single document do

``` js
a.get('hello', function(err, docs) {
  a.merge('hello', docs, 'a + b')
})
```

Merges will replicate as well

``` js
// wait a bit for a to replicate to b
b.get('hello', function(err, docs) {
  console.log(docs) // will print [{peer:..., value:'a + b'}]
})
```

## API

#### var mdb = mmm(db, [options])

Create a new database. `db` is a levelup instance.
Options can include

``` js
{
  id: peerId, // defaults to a cuid
  encoding: 'json' | 'utf-8' | 'binary', // the value encoding. defaults to binary
  preupdate: function(logData, cb) {},  // set a preupdate hook
  postupdate: function(logData, cb) {} // set a postupdate hook
}
```

#### mdb.put(key, value, [cb])

Insert a new document. Callback is called with `cb(err, doc)` where doc is the inserted document.

#### mdb.get(key, cb)

Get documents stored on `key`. Callback is called with `cb(err, docs)`.

#### mdb.createReadStream([options])

Get a stream of all `{key:key, peer:peer, seq:seq, value:docs}` pair in the database.
You can pass in `gt`,`gte`,`lt`,`lte` options similar to levelup.

#### mdb.createKeyStream([options])

Similar to `createReadStream` but only returns keys

#### mdb.createLogStream([options])

Get a stream of all `{key:key, value:doc}` pairs in the log (all revisions of docs). Works about 10x faster than createValueStream, but returns all revisions, even merged ones.

#### mdb.merge(key, docs, newValue, [cb])

Merge multiple documents into a new document. Callback is called with `cb(err, doc)` where doc is the inserted merged document.

#### var stream = mdb.sync([options])

Returns a replication stream that can be piped to another `mdb` instance to replicate between them.
Per defaults changes are replicated both ways. If you only want to push changes to another instance set
`{mode: 'push'}` and if you only want to get changes do `{mode: 'pull'}`

#### mdb.fwdb

The used fwdb instance

#### mdb.log

The used scuttleup instance

## License

MIT