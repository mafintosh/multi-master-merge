var json = {
  encode: function(obj) {
    return Buffer.isBuffer(obj) ? obj : new Buffer(JSON.stringify(obj))
  },
  decode: function(buf) {
    return JSON.parse(buf.toString())
  }
}

var utf8 = {
  encode: function(str) {
    return Buffer.isBuffer(str) ? str : new Buffer(str)
  },
  decode: function(buf) {
    return buf.toString()
  }
}

var binary = {
  encode: function(buf) {
    return typeof buf === 'string' ? new Buffer(buf) : buf
  },
  decode: function(buf) {
    return buf
  }
}

module.exports = function(enc) {
  if (!enc) enc = 'binary'
  if (typeof enc.encode === 'function') return enc

  switch (enc) {
    case 'utf-8':
    case 'utf8':
    case 'ascii':
    return utf8

    case 'json':
    return json

    case 'binary':
    return binary

    default:
    throw new Error('Unknown encoding: '+enc)
  }
}