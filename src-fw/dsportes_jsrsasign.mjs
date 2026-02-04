/* eslint-disable no-extra-semi */
/* eslint-disable no-unused-vars */
/* eslint-disable no-mixed-spaces-and-tabs */
/* eslint-disable eqeqeq */
export var KJUR = {
  crypto: {
    ECDSA: {}
  },
  asn1: {
  },
  lang: {
    String: function() {}
  }
}
var ASN1HEX = {}

/**
 * simple ASN.1 DER hexadecimal string checker<br/>
 * @name isASN1HEX
 * @memberOf ASN1HEX
 * @function
 * @param {String} hex string to check whether it is hexadecmal string for ASN.1 DER or not
 * @return {Boolean} true if it is hexadecimal string of ASN.1 data otherwise false
 * @since jsrsasign 4.8.3 asn1hex 1.1.6
 * @description
 * This method checks wheather the argument 'hex' is a hexadecimal string of
 * ASN.1 data or not.
 * @example
 * ASN1HEX.isASN1HEX('0203012345') &rarr; true // PROPER ASN.1 INTEGER
 * ASN1HEX.isASN1HEX('0203012345ff') &rarr; false // TOO LONG VALUE
 * ASN1HEX.isASN1HEX('02030123') &rarr; false // TOO SHORT VALUE
 * ASN1HEX.isASN1HEX('fa3bcd') &rarr; false // WRONG FOR ASN.1
 */
ASN1HEX.isASN1HEX = function(hex) {
  var _ASN1HEX = ASN1HEX;
  if (hex.length % 2 == 1) return false;

  var intL = _ASN1HEX.getVblen(hex, 0);
  var hT = hex.substr(0, 2);
  var hL = _ASN1HEX.getL(hex, 0);
  var hVLength = hex.length - hT.length - hL.length;
  if (hVLength == intL * 2) return true;

  return false;
};

/**
 * check whether a string is an hexadecimal string or not (DEPRECATED)<br/>
 * @name isHex
 * @memberOf KJUR.lang.String
 * @function
 * @static
 * @param {String} s input string
 * @return {Boolean} true if a string "s" is an hexadecimal string otherwise false
 * @since base64x 1.1.7 jsrsasign 5.0.13
 * @deprecated from 10.0.6. please use {@link ishex}
 * @see ishex
 * @example
 * KJUR.lang.String.isHex("1234") &rarr; true
 * KJUR.lang.String.isHex("12ab") &rarr; true
 * KJUR.lang.String.isHex("12AB") &rarr; true
 * KJUR.lang.String.isHex("12ZY") &rarr; false
 * KJUR.lang.String.isHex("121") &rarr; false -- odd length
 */
KJUR.lang.String.isHex = function(s) {
  return ishex(s);
};

/**
 * check whether a string is an hexadecimal string or not<br/>
 * @name ishex
 * @function
 * @static
 * @param {String} s input string
 * @return {Boolean} true if a string "s" is an hexadecimal string otherwise false
 * @since base64x 1.1.7 jsrsasign 5.0.13
 * @example
 * ishex("1234") &rarr; true
 * ishex("12ab") &rarr; true
 * ishex("12AB") &rarr; true
 * ishex("12ZY") &rarr; false
 * ishex("121") &rarr; false -- odd length
 */
function ishex(s) {
  if (s.length % 2 == 0 &&
	(s.match(/^[0-9a-f]+$/) || s.match(/^[0-9A-F]+$/))) {
    return true;
  } else {
    return false;
  }
};

// ==== string / byte array ================================
/**
 * convert a string to an array of character codes
 * @name stoBA
 * @function
 * @param {String} s
 * @return {Array of Numbers} 
 */
function stoBA(s) {
  var a = new Array();
  for (var i = 0; i < s.length; i++) {
    a[i] = s.charCodeAt(i);
  }
  return a;
}

// ==== byte array / hex ================================
/**
 * convert an array of bytes(Number) to hexadecimal string.<br/>
 * @name BAtohex
 * @function
 * @param {Array of Numbers} a array of bytes
 * @return {String} hexadecimal string
 */
function BAtohex(a) {
  var s = '';
  for (var i = 0; i < a.length; i++) {
    var hex1 = a[i].toString(16);
    if (hex1.length == 1) hex1 = '0' + hex1;
    s = s + hex1;
  }
  return s;
}

// ==== string / hex ================================
/**
 * convert a ASCII string to a hexadecimal string of ASCII codes.<br/>
 * NOTE: This can't be used for non ASCII characters.
 * @name stohex
 * @function
 * @param {s} s ASCII string
 * @return {String} hexadecimal string
 */
function stohex(s) {
  return BAtohex(stoBA(s));
}

// ==== URIComponent ================================
/**
 * convert UTFa hexadecimal string to a URLComponent string such like "%67%68".<br/>
 * Note that these "<code>0-9A-Za-z!'()*-._~</code>" characters will not
 * converted to "%xx" format by builtin 'encodeURIComponent()' function.
 * However this 'encodeURIComponentAll()' function will convert 
 * all of characters into "%xx" format.
 * @name encodeURIComponentAll
 * @function
 * @param {String} s hexadecimal string
 * @return {String} URIComponent string such like "%67%68"
 * @since 1.1
 */
function encodeURIComponentAll(u8) {
  var s = encodeURIComponent(u8);
  var s2 = '';
  for (var i = 0; i < s.length; i++) {
    if (s[i] == '%') {
      s2 = s2 + s.substr(i, 3);
      i = i + 2;
    } else {
      s2 = s2 + '%' + stohex(s[i]);
    }
  }
  return s2;
}

// ==== URIComponent / hex ================================
/**
 * convert a URLComponent string such like "%67%68" to a hexadecimal string.<br/>
 * @name uricmptohex
 * @function
 * @param {String} s URIComponent string such like "%67%68"
 * @return {String} hexadecimal string
 * @since 1.1
 */
function uricmptohex(s) {
  // eslint-disable-next-line quotes
  return s.replace(/%/g, "");
}

// ==== utf8 / hex ================================
/**
 * convert a UTF-8 encoded string including CJK or Latin to a hexadecimal encoded string.<br/>
 * @name utf8tohex
 * @function
 * @param {String} s UTF-8 encoded string
 * @return {String} hexadecimal encoded string
 * @since 1.1.1
 */
function utf8tohex(s) {
  return uricmptohex(encodeURIComponentAll(s)).toLowerCase();
}

/*! (c) Tom Wu | http://www-cs-students.stanford.edu/~tjw/jsbn/
 */
// Copyright (c) 2005  Tom Wu
// All Rights Reserved.
// See "LICENSE" for details.

// Basic JavaScript BN library - subset useful for RSA encryption.

// Bits per digit
var dbits;

// JavaScript engine analysis
var canary = 0xdeadbeefcafe;
var j_lm = ((canary&0xffffff)==0xefcafe);

// (public) Constructor
function BigInteger(a,b,c) {
  if(a != null)
    if('number' == typeof a) this.fromNumber(a,b,c);
    else if(b == null && 'string' != typeof a) this.fromString(a,256);
    else this.fromString(a,b);
}

// (public) return value as integer
function bnIntValue() {
  if(this.s < 0) {
    if(this.t == 1) return this[0]-this.DV;
    else if(this.t == 0) return -1;
  }
  else if(this.t == 1) return this[0];
  else if(this.t == 0) return 0;
  // assumes 16 < DB < 32
  return ((this[1]&((1<<(32-this.DB))-1))<<this.DB)|this[0];
}

// return new, unset BigInteger
function nbi() { return new BigInteger(null); }

// am: Compute w_j += (x*this_i), propagate carries,
// c is initial carry, returns final carry.
// c < 3*dvalue, x < 2*dvalue, this_i < dvalue
// We need to select the fastest one that works in this environment.

// am1: use a single mult and divide to get the high bits,
// max digit bits should be 26 because
// max internal value = 2*dvalue^2-2*dvalue (< 2^53)
function am1(i,x,w,j,c,n) {
  while(--n >= 0) {
    var v = x*this[i++]+w[j]+c;
    c = Math.floor(v/0x4000000);
    w[j++] = v&0x3ffffff;
  }
  return c;
}
// am2 avoids a big mult-and-extract completely.
// Max digit bits should be <= 30 because we do bitwise ops
// on values up to 2*hdvalue^2-hdvalue-1 (< 2^31)
function am2(i,x,w,j,c,n) {
  var xl = x&0x7fff, xh = x>>15;
  while(--n >= 0) {
    var l = this[i]&0x7fff;
    var h = this[i++]>>15;
    var m = xh*l+h*xl;
    l = xl*l+((m&0x7fff)<<15)+w[j]+(c&0x3fffffff);
    c = (l>>>30)+(m>>>15)+xh*h+(c>>>30);
    w[j++] = l&0x3fffffff;
  }
  return c;
}
// Alternately, set max digit bits to 28 since some
// browsers slow down when dealing with 32-bit numbers.
function am3(i,x,w,j,c,n) {
  var xl = x&0x3fff, xh = x>>14;
  while(--n >= 0) {
    var l = this[i]&0x3fff;
    var h = this[i++]>>14;
    var m = xh*l+h*xl;
    l = xl*l+((m&0x3fff)<<14)+w[j]+c;
    c = (l>>28)+(m>>14)+xh*h;
    w[j++] = l&0xfffffff;
  }
  return c;
}
if(j_lm && (navigator.appName == 'Microsoft Internet Explorer')) {
  BigInteger.prototype.am = am2;
  dbits = 30;
}
else if(j_lm && (navigator.appName != 'Netscape')) {
  BigInteger.prototype.am = am1;
  dbits = 26;
}
else { // Mozilla/Netscape seems to prefer am3
  BigInteger.prototype.am = am3;
  dbits = 28;
}

BigInteger.prototype.DB = dbits;
BigInteger.prototype.DM = ((1<<dbits)-1);
BigInteger.prototype.DV = (1<<dbits);

var BI_FP = 52;
BigInteger.prototype.FV = Math.pow(2,BI_FP);
BigInteger.prototype.F1 = BI_FP-dbits;
BigInteger.prototype.F2 = 2*dbits-BI_FP;

// Digit conversions
var BI_RM = '0123456789abcdefghijklmnopqrstuvwxyz';
var BI_RC = new Array();
var rr,vv;
rr = '0'.charCodeAt(0);
for(vv = 0; vv <= 9; ++vv) BI_RC[rr++] = vv;
rr = 'a'.charCodeAt(0);
for(vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;
rr = 'A'.charCodeAt(0);
for(vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;

function int2char(n) { return BI_RM.charAt(n); }
function intAt(s,i) {
  var c = BI_RC[s.charCodeAt(i)];
  return (c==null)?-1:c;
}

// (protected) copy this to r
function bnpCopyTo(r) {
  for(var i = this.t-1; i >= 0; --i) r[i] = this[i];
  r.t = this.t;
  r.s = this.s;
}

// (protected) set from integer value x, -DV <= x < DV
function bnpFromInt(x) {
  this.t = 1;
  this.s = (x<0)?-1:0;
  if(x > 0) this[0] = x;
  else if(x < -1) this[0] = x+this.DV;
  else this.t = 0;
}

// return bigint initialized to value
function nbv(i) { var r = nbi(); r.fromInt(i); return r; }

// (protected) set from string and radix
function bnpFromString(s,b) {
  var k;
  if(b == 16) k = 4;
  else if(b == 8) k = 3;
  else if(b == 256) k = 8; // byte array
  else if(b == 2) k = 1;
  else if(b == 32) k = 5;
  else if(b == 4) k = 2;
  else { this.fromRadix(s,b); return; }
  this.t = 0;
  this.s = 0;
  var i = s.length, mi = false, sh = 0;
  while(--i >= 0) {
    var x = (k==8)?s[i]&0xff:intAt(s,i);
    if(x < 0) {
      if(s.charAt(i) == '-') mi = true;
      continue;
    }
    mi = false;
    if(sh == 0)
      this[this.t++] = x;
    else if(sh+k > this.DB) {
      this[this.t-1] |= (x&((1<<(this.DB-sh))-1))<<sh;
      this[this.t++] = (x>>(this.DB-sh));
    }
    else
      this[this.t-1] |= x<<sh;
    sh += k;
    if(sh >= this.DB) sh -= this.DB;
  }
  if(k == 8 && (s[0]&0x80) != 0) {
    this.s = -1;
    if(sh > 0) this[this.t-1] |= ((1<<(this.DB-sh))-1)<<sh;
  }
  this.clamp();
  if(mi) BigInteger.ZERO.subTo(this,this);
}

// (protected) clamp off excess high words
function bnpClamp() {
  var c = this.s&this.DM;
  while(this.t > 0 && this[this.t-1] == c) --this.t;
}

// (public) return string representation in given radix
function bnToString(b) {
  if(this.s < 0) return '-'+this.negate().toString(b);
  var k;
  if(b == 16) k = 4;
  else if(b == 8) k = 3;
  else if(b == 2) k = 1;
  else if(b == 32) k = 5;
  else if(b == 4) k = 2;
  else return this.toRadix(b);
  var km = (1<<k)-1, d, m = false, r = '', i = this.t;
  var p = this.DB-(i*this.DB)%k;
  if(i-- > 0) {
    if(p < this.DB && (d = this[i]>>p) > 0) { m = true; r = int2char(d); }
    while(i >= 0) {
      if(p < k) {
        d = (this[i]&((1<<p)-1))<<(k-p);
        d |= this[--i]>>(p+=this.DB-k);
      }
      else {
        d = (this[i]>>(p-=k))&km;
        if(p <= 0) { p += this.DB; --i; }
      }
      if(d > 0) m = true;
      if(m) r += int2char(d);
    }
  }
  return m?r:'0';
}

// (public) -this
function bnNegate() { var r = nbi(); BigInteger.ZERO.subTo(this,r); return r; }

// (public) |this|
function bnAbs() { return (this.s<0)?this.negate():this; }

// (public) return + if this > a, - if this < a, 0 if equal
function bnCompareTo(a) {
  var r = this.s-a.s;
  if(r != 0) return r;
  var i = this.t;
  r = i-a.t;
  if(r != 0) return (this.s<0)?-r:r;
  while(--i >= 0) if((r=this[i]-a[i]) != 0) return r;
  return 0;
}

// returns bit length of the integer x
function nbits(x) {
  var r = 1, t;
  if((t=x>>>16) != 0) { x = t; r += 16; }
  if((t=x>>8) != 0) { x = t; r += 8; }
  if((t=x>>4) != 0) { x = t; r += 4; }
  if((t=x>>2) != 0) { x = t; r += 2; }
  if((t=x>>1) != 0) { x = t; r += 1; }
  return r;
}

// (public) return the number of bits in "this"
function bnBitLength() {
  if(this.t <= 0) return 0;
  return this.DB*(this.t-1)+nbits(this[this.t-1]^(this.s&this.DM));
}

// (protected) r = this << n*DB
function bnpDLShiftTo(n,r) {
  var i;
  for(i = this.t-1; i >= 0; --i) r[i+n] = this[i];
  for(i = n-1; i >= 0; --i) r[i] = 0;
  r.t = this.t+n;
  r.s = this.s;
}

// (protected) r = this >> n*DB
function bnpDRShiftTo(n,r) {
  for(var i = n; i < this.t; ++i) r[i-n] = this[i];
  r.t = Math.max(this.t-n,0);
  r.s = this.s;
}

// (protected) r = this << n
function bnpLShiftTo(n,r) {
  var bs = n%this.DB;
  var cbs = this.DB-bs;
  var bm = (1<<cbs)-1;
  var ds = Math.floor(n/this.DB), c = (this.s<<bs)&this.DM, i;
  for(i = this.t-1; i >= 0; --i) {
    r[i+ds+1] = (this[i]>>cbs)|c;
    c = (this[i]&bm)<<bs;
  }
  for(i = ds-1; i >= 0; --i) r[i] = 0;
  r[ds] = c;
  r.t = this.t+ds+1;
  r.s = this.s;
  r.clamp();
}

// (protected) r = this >> n
function bnpRShiftTo(n,r) {
  r.s = this.s;
  var ds = Math.floor(n/this.DB);
  if(ds >= this.t) { r.t = 0; return; }
  var bs = n%this.DB;
  var cbs = this.DB-bs;
  var bm = (1<<bs)-1;
  r[0] = this[ds]>>bs;
  for(var i = ds+1; i < this.t; ++i) {
    r[i-ds-1] |= (this[i]&bm)<<cbs;
    r[i-ds] = this[i]>>bs;
  }
  if(bs > 0) r[this.t-ds-1] |= (this.s&bm)<<cbs;
  r.t = this.t-ds;
  r.clamp();
}

// (protected) r = this - a
function bnpSubTo(a,r) {
  var i = 0, c = 0, m = Math.min(a.t,this.t);
  while(i < m) {
    c += this[i]-a[i];
    r[i++] = c&this.DM;
    c >>= this.DB;
  }
  if(a.t < this.t) {
    c -= a.s;
    while(i < this.t) {
      c += this[i];
      r[i++] = c&this.DM;
      c >>= this.DB;
    }
    c += this.s;
  }
  else {
    c += this.s;
    while(i < a.t) {
      c -= a[i];
      r[i++] = c&this.DM;
      c >>= this.DB;
    }
    c -= a.s;
  }
  r.s = (c<0)?-1:0;
  if(c < -1) r[i++] = this.DV+c;
  else if(c > 0) r[i++] = c;
  r.t = i;
  r.clamp();
}

// (protected) r = this * a, r != this,a (HAC 14.12)
// "this" should be the larger one if appropriate.
function bnpMultiplyTo(a,r) {
  var x = this.abs(), y = a.abs();
  var i = x.t;
  r.t = i+y.t;
  while(--i >= 0) r[i] = 0;
  for(i = 0; i < y.t; ++i) r[i+x.t] = x.am(0,y[i],r,i,0,x.t);
  r.s = 0;
  r.clamp();
  if(this.s != a.s) BigInteger.ZERO.subTo(r,r);
}

// (protected) r = this^2, r != this (HAC 14.16)
function bnpSquareTo(r) {
  var x = this.abs();
  var i = r.t = 2*x.t;
  while(--i >= 0) r[i] = 0;
  for(i = 0; i < x.t-1; ++i) {
    var c = x.am(i,x[i],r,2*i,0,1);
    if((r[i+x.t]+=x.am(i+1,2*x[i],r,2*i+1,c,x.t-i-1)) >= x.DV) {
      r[i+x.t] -= x.DV;
      r[i+x.t+1] = 1;
    }
  }
  if(r.t > 0) r[r.t-1] += x.am(i,x[i],r,2*i,0,1);
  r.s = 0;
  r.clamp();
}

// (protected) divide this by m, quotient and remainder to q, r (HAC 14.20)
// r != q, this != m.  q or r may be null.
function bnpDivRemTo(m,q,r) {
  var pm = m.abs();
  if(pm.t <= 0) return;
  var pt = this.abs();
  if(pt.t < pm.t) {
    if(q != null) q.fromInt(0);
    if(r != null) this.copyTo(r);
    return;
  }
  if(r == null) r = nbi();
  var y = nbi(), ts = this.s, ms = m.s;
  var nsh = this.DB-nbits(pm[pm.t-1]);	// normalize modulus
  if(nsh > 0) { pm.lShiftTo(nsh,y); pt.lShiftTo(nsh,r); }
  else { pm.copyTo(y); pt.copyTo(r); }
  var ys = y.t;
  var y0 = y[ys-1];
  if(y0 == 0) return;
  var yt = y0*(1<<this.F1)+((ys>1)?y[ys-2]>>this.F2:0);
  var d1 = this.FV/yt, d2 = (1<<this.F1)/yt, e = 1<<this.F2;
  var i = r.t, j = i-ys, t = (q==null)?nbi():q;
  y.dlShiftTo(j,t);
  if(r.compareTo(t) >= 0) {
    r[r.t++] = 1;
    r.subTo(t,r);
  }
  BigInteger.ONE.dlShiftTo(ys,t);
  t.subTo(y,y);	// "negative" y so we can replace sub with am later
  while(y.t < ys) y[y.t++] = 0;
  while(--j >= 0) {
    // Estimate quotient digit
    var qd = (r[--i]==y0)?this.DM:Math.floor(r[i]*d1+(r[i-1]+e)*d2);
    if((r[i]+=y.am(0,qd,r,j,0,ys)) < qd) {	// Try it out
      y.dlShiftTo(j,t);
      r.subTo(t,r);
      while(r[i] < --qd) r.subTo(t,r);
    }
  }
  if(q != null) {
    r.drShiftTo(ys,q);
    if(ts != ms) BigInteger.ZERO.subTo(q,q);
  }
  r.t = ys;
  r.clamp();
  if(nsh > 0) r.rShiftTo(nsh,r);	// Denormalize remainder
  if(ts < 0) BigInteger.ZERO.subTo(r,r);
}

// (public) this mod a
function bnMod(a) {
  var r = nbi();
  this.abs().divRemTo(a,null,r);
  if(this.s < 0 && r.compareTo(BigInteger.ZERO) > 0) a.subTo(r,r);
  return r;
}

// Modular reduction using "classic" algorithm
function Classic(m) { this.m = m; }
function cConvert(x) {
  if(x.s < 0 || x.compareTo(this.m) >= 0) return x.mod(this.m);
  else return x;
}
function cRevert(x) { return x; }
function cReduce(x) { x.divRemTo(this.m,null,x); }
function cMulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }
function cSqrTo(x,r) { x.squareTo(r); this.reduce(r); }

Classic.prototype.convert = cConvert;
Classic.prototype.revert = cRevert;
Classic.prototype.reduce = cReduce;
Classic.prototype.mulTo = cMulTo;
Classic.prototype.sqrTo = cSqrTo;

// (protected) return "-1/this % 2^DB"; useful for Mont. reduction
// justification:
//         xy == 1 (mod m)
//         xy =  1+km
//   xy(2-xy) = (1+km)(1-km)
// x[y(2-xy)] = 1-k^2m^2
// x[y(2-xy)] == 1 (mod m^2)
// if y is 1/x mod m, then y(2-xy) is 1/x mod m^2
// should reduce x and y(2-xy) by m^2 at each step to keep size bounded.
// JS multiply "overflows" differently from C/C++, so care is needed here.
function bnpInvDigit() {
  if(this.t < 1) return 0;
  var x = this[0];
  if((x&1) == 0) return 0;
  var y = x&3;		// y == 1/x mod 2^2
  y = (y*(2-(x&0xf)*y))&0xf;	// y == 1/x mod 2^4
  y = (y*(2-(x&0xff)*y))&0xff;	// y == 1/x mod 2^8
  y = (y*(2-(((x&0xffff)*y)&0xffff)))&0xffff;	// y == 1/x mod 2^16
  // last step - calculate inverse mod DV directly;
  // assumes 16 < DB <= 32 and assumes ability to handle 48-bit ints
  y = (y*(2-x*y%this.DV))%this.DV;		// y == 1/x mod 2^dbits
  // we really want the negative inverse, and -DV < y < DV
  return (y>0)?this.DV-y:-y;
}

// Montgomery reduction
function Montgomery(m) {
  this.m = m;
  this.mp = m.invDigit();
  this.mpl = this.mp&0x7fff;
  this.mph = this.mp>>15;
  this.um = (1<<(m.DB-15))-1;
  this.mt2 = 2*m.t;
}

// xR mod m
function montConvert(x) {
  var r = nbi();
  x.abs().dlShiftTo(this.m.t,r);
  r.divRemTo(this.m,null,r);
  if(x.s < 0 && r.compareTo(BigInteger.ZERO) > 0) this.m.subTo(r,r);
  return r;
}

// x/R mod m
function montRevert(x) {
  var r = nbi();
  x.copyTo(r);
  this.reduce(r);
  return r;
}

// x = x/R mod m (HAC 14.32)
function montReduce(x) {
  while(x.t <= this.mt2)	// pad x so am has enough room later
    x[x.t++] = 0;
  for(var i = 0; i < this.m.t; ++i) {
    // faster way of calculating u0 = x[i]*mp mod DV
    var j = x[i]&0x7fff;
    var u0 = (j*this.mpl+(((j*this.mph+(x[i]>>15)*this.mpl)&this.um)<<15))&x.DM;
    // use am to combine the multiply-shift-add into one call
    j = i+this.m.t;
    x[j] += this.m.am(0,u0,x,i,0,this.m.t);
    // propagate carry
    while(x[j] >= x.DV) { x[j] -= x.DV; x[++j]++; }
  }
  x.clamp();
  x.drShiftTo(this.m.t,x);
  if(x.compareTo(this.m) >= 0) x.subTo(this.m,x);
}

// r = "x^2/R mod m"; x != r
function montSqrTo(x,r) { x.squareTo(r); this.reduce(r); }

// r = "xy/R mod m"; x,y != r
function montMulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }

Montgomery.prototype.convert = montConvert;
Montgomery.prototype.revert = montRevert;
Montgomery.prototype.reduce = montReduce;
Montgomery.prototype.mulTo = montMulTo;
Montgomery.prototype.sqrTo = montSqrTo;

// (protected) true iff this is even
function bnpIsEven() { return ((this.t>0)?(this[0]&1):this.s) == 0; }

// (protected) this^e, e < 2^32, doing sqr and mul with "r" (HAC 14.79)
function bnpExp(e,z) {
  if(e > 0xffffffff || e < 1) return BigInteger.ONE;
  var r = nbi(), r2 = nbi(), g = z.convert(this), i = nbits(e)-1;
  g.copyTo(r);
  while(--i >= 0) {
    z.sqrTo(r,r2);
    if((e&(1<<i)) > 0) z.mulTo(r2,g,r);
    else { var t = r; r = r2; r2 = t; }
  }
  return z.revert(r);
}

// (public) this^e % m, 0 <= e < 2^32
function bnModPowInt(e,m) {
  var z;
  if(e < 256 || m.isEven()) z = new Classic(m); else z = new Montgomery(m);
  return this.exp(e,z);
}

// protected
BigInteger.prototype.copyTo = bnpCopyTo;
BigInteger.prototype.fromInt = bnpFromInt;
BigInteger.prototype.fromString = bnpFromString;
BigInteger.prototype.clamp = bnpClamp;
BigInteger.prototype.dlShiftTo = bnpDLShiftTo;
BigInteger.prototype.drShiftTo = bnpDRShiftTo;
BigInteger.prototype.lShiftTo = bnpLShiftTo;
BigInteger.prototype.rShiftTo = bnpRShiftTo;
BigInteger.prototype.subTo = bnpSubTo;
BigInteger.prototype.multiplyTo = bnpMultiplyTo;
BigInteger.prototype.squareTo = bnpSquareTo;
BigInteger.prototype.divRemTo = bnpDivRemTo;
BigInteger.prototype.invDigit = bnpInvDigit;
BigInteger.prototype.isEven = bnpIsEven;
BigInteger.prototype.exp = bnpExp;

// public
BigInteger.prototype.toString = bnToString;
BigInteger.prototype.negate = bnNegate;
BigInteger.prototype.abs = bnAbs;
BigInteger.prototype.compareTo = bnCompareTo;
BigInteger.prototype.bitLength = bnBitLength;
BigInteger.prototype.mod = bnMod;
BigInteger.prototype.modPowInt = bnModPowInt;
BigInteger.prototype.intValue = bnIntValue // DANIEL

// "constants"
BigInteger.ZERO = nbv(0);
BigInteger.ONE = nbv(1);

/**
 * strict ASN.1 DER hexadecimal string checker
 * @name checkStrictDER
 * @memberOf ASN1HEX
 * @function
 * @param {String} hex string to check whether it is hexadecmal string for ASN.1 DER or not
 * @return unspecified
 * @since jsrsasign 8.0.19 asn1hex 1.2.1
 * @throws Error when malformed ASN.1 DER hexadecimal string
 * @description
 * This method checks wheather the argument 'hex' is a hexadecimal string of
 * ASN.1 data or not. If the argument is not DER string, this 
 * raise an exception.
 * @example
 * ASN1HEX.checkStrictDER('0203012345') &rarr; NO EXCEPTION FOR PROPER ASN.1 INTEGER
 * ASN1HEX.checkStrictDER('0203012345ff') &rarr; RAISE EXCEPTION FOR TOO LONG VALUE
 * ASN1HEX.checkStrictDER('02030123') &rarr; false RAISE EXCEPITON FOR TOO SHORT VALUE
 * ASN1HEX.checkStrictDER('fa3bcd') &rarr; false RAISE EXCEPTION FOR WRONG ASN.1
 */
ASN1HEX.checkStrictDER = function(h, idx, maxHexLen, maxByteLen, maxLbyteLen) {
  var _ASN1HEX = ASN1HEX;

  if (maxHexLen === undefined) {
    // 1. hex string check
    if (typeof h != 'string') throw new Error('not hex string');
    h = h.toLowerCase();
    if (! KJUR.lang.String.isHex(h)) throw new Error('not hex string');

    // 2. set max if needed
    // max length of hexadecimal string
    maxHexLen = h.length;
    // max length of octets
    maxByteLen = h.length / 2;
    // max length of L octets of TLV
    if (maxByteLen < 0x80) {
	    maxLbyteLen = 1;
    } else {
	    maxLbyteLen = Math.ceil(maxByteLen.toString(16)) + 1;
    }
  }
  //console.log(maxHexLen + ":" + maxByteLen + ":" + maxLbyteLen);

  // 3. check if L(length) string not exceeds maxLbyteLen
  var hL = _ASN1HEX.getL(h, idx);
  if (hL.length > maxLbyteLen * 2)
    throw new Error('L of TLV too long: idx=' + idx);

  // 4. check if V(value) octet length (i.e. L(length) value) 
  //    not exceeds maxByteLen
  var vblen = _ASN1HEX.getVblen(h, idx);
  if (vblen > maxByteLen) 
    throw new Error('value of L too long than hex: idx=' + idx);

  // 5. check V string length and L's value are the same
  var hTLV = _ASN1HEX.getTLV(h, idx);
  var hVLength = 
	hTLV.length - 2 - _ASN1HEX.getL(h, idx).length;
  if (hVLength !== (vblen * 2))
    throw new Error('V string length and L\'s value not the same:' +
		        hVLength + '/' + (vblen * 2));

  // 6. check appending garbled string
  if (idx === 0) {
    if (h.length != hTLV.length)
	    throw new Error('total length and TLV length unmatch:' +
			    h.length + '!=' + hTLV.length);
  }

  // 7. check if there isn't prepending zeros in DER INTEGER value
  var hT = h.substr(idx, 2);
  if (hT === '02') {
    var vidx = _ASN1HEX.getVidx(h, idx);
    // check if DER INTEGER VALUE have least leading zeros 
    // for two's complement
    // GOOD - 3fabde... 008fad...
    // BAD  - 000012... 007fad...
    if (h.substr(vidx, 2) == '00' && h.charCodeAt(vidx + 2) < 56) // '8'=56
	    throw new Error('not least zeros for DER INTEGER');
  }

  // 8. check if all of elements in a structured item are conformed to
  //    strict DER encoding rules.
  if (parseInt(hT, 16) & 32) { // structured tag?
    var intL = _ASN1HEX.getVblen(h, idx);
    var sum = 0;
    var aIdx = _ASN1HEX.getChildIdx(h, idx);
    for (var i = 0; i < aIdx.length; i++) {
	    var tlv = _ASN1HEX.getTLV(h, aIdx[i]);
	    sum += tlv.length;
	    _ASN1HEX.checkStrictDER(h, aIdx[i], 
				   maxHexLen, maxByteLen, maxLbyteLen);
    }
    if ((intL * 2) != sum)
	    throw new Error('sum of children\'s TLV length and L unmatch: ' +
			    (intL * 2) + '!=' + sum);
  }
};

// ========== children methods ===============================
/**
 * get array of string indexes of child ASN.1 objects<br/>
 * @name getChildIdx
 * @memberOf ASN1HEX
 * @function
 * @param {String} h hexadecimal string of ASN.1 DER encoded data
 * @param {Number} idx start string index of ASN.1 object
 * @return {Array of Number} array of indexes for childen of ASN.1 objects
 * @since jsrsasign 7.2.0 asn1hex 1.1.11
 * @description
 * This method returns array of integers for a concatination of ASN.1 objects
 * in a ASN.1 value. As for BITSTRING, one byte of unusedbits is skipped.
 * As for other ASN.1 simple types such as INTEGER, OCTET STRING or PRINTABLE STRING,
 * it returns a array of a string index of its ASN.1 value.<br/>
 * NOTE: Since asn1hex 1.1.7 of jsrsasign 6.1.2, Encapsulated BitString is supported.
 * @example
 * ASN1HEX.getChildIdx("0203012345", 0) &rArr; [4] // INTEGER 012345
 * ASN1HEX.getChildIdx("1303616161", 0) &rArr; [4] // PrintableString aaa
 * ASN1HEX.getChildIdx("030300ffff", 0) &rArr; [6] // BITSTRING ffff (unusedbits=00a)
 * ASN1HEX.getChildIdx("3006020104020105", 0) &rArr; [4, 10] // SEQUENCE(INT4,INT5)
 */
ASN1HEX.getChildIdx = function(h, idx) {
  var _ASN1HEX = ASN1HEX;
  var a = [];
  var idxStart, totalChildBlen, currentChildBlen;

  idxStart = _ASN1HEX.getVidx(h, idx);
  totalChildBlen = _ASN1HEX.getVblen(h, idx) * 2;
  if (h.substr(idx, 2) == '03') {  // BITSTRING without unusedbits
    idxStart += 2;
    totalChildBlen -= 2;
  }

  currentChildBlen = 0;
  var i = idxStart;
  while (currentChildBlen <= totalChildBlen) {
    var tlvBlen = _ASN1HEX.getTLVblen(h, i);
    currentChildBlen += tlvBlen;
    if (currentChildBlen <= totalChildBlen) a.push(i);
    i += tlvBlen;
    if (currentChildBlen >= totalChildBlen) break;
  }
  return a;
};

/**
 * get byte length for ASN.1 L(length) bytes<br/>
 * @name getLblen
 * @memberOf ASN1HEX
 * @function
 * @param {String} s hexadecimal string of ASN.1 DER encoded data
 * @param {Number} idx string index
 * @return byte length for ASN.1 L(length) bytes
 * @since jsrsasign 7.2.0 asn1hex 1.1.11
 * @example
 * ASN1HEX.getLblen('020100', 0) &rarr; 1 for '01'
 * ASN1HEX.getLblen('020200', 0) &rarr; 1 for '02'
 * ASN1HEX.getLblen('02818003...', 0) &rarr; 2 for '8180'
 * ASN1HEX.getLblen('0282025b03...', 0) &rarr; 3 for '82025b'
 * ASN1HEX.getLblen('0280020100...', 0) &rarr; -1 for '80' BER indefinite length
 * ASN1HEX.getLblen('02ffab...', 0) &rarr; -2 for malformed ASN.1 length
 */
ASN1HEX.getLblen = function(s, idx) {
  if (s.substr(idx + 2, 1) != '8') return 1;
  var i = parseInt(s.substr(idx + 3, 1));
  if (i == 0) return -1;             // length octet '80' indefinite length
  if (0 < i && i < 10) return i + 1; // including '8?' octet;
  return -2;                         // malformed format
};

/**
 * get hexadecimal string for ASN.1 L(length) bytes<br/>
 * @name getL
 * @memberOf ASN1HEX
 * @function
 * @param {String} s hexadecimal string of ASN.1 DER encoded data
 * @param {Number} idx string index to get L of ASN.1 object
 * @return {String} hexadecimal string for ASN.1 L(length) bytes
 * @since jsrsasign 7.2.0 asn1hex 1.1.11
 */
ASN1HEX.getL = function(s, idx) {
  var len = ASN1HEX.getLblen(s, idx);
  if (len < 1) return '';
  return s.substr(idx + 2, len * 2);
};

/**
 * get integer value of ASN.1 length for ASN.1 data<br/>
 * @name getVblen
 * @memberOf ASN1HEX
 * @function
 * @param {String} s hexadecimal string of ASN.1 DER encoded data
 * @param {Number} idx string index
 * @return {Number} ASN.1 L(length) integer value
 * @since jsrsasign 7.2.0 asn1hex 1.1.11
 */
/*
 getting ASN.1 length value at the position 'idx' of
 hexa decimal string 's'.
 f('3082025b02...', 0) ... 82025b ... ???
 f('020100', 0) ... 01 ... 1
 f('0203001...', 0) ... 03 ... 3
 f('02818003...', 0) ... 8180 ... 128
 */
ASN1HEX.getVblen = function(s, idx) {
  var hLen, bi;
  hLen = ASN1HEX.getL(s, idx);
  if (hLen == '') return -1;
  if (hLen.substr(0, 1) === '8') {
    bi = new BigInteger(hLen.substr(2), 16);
  } else {
    bi = new BigInteger(hLen, 16);
  }
  return bi.intValue();
};

/**
 * get byte length of ASN.1 TLV at specified string index<br/>
 * @name getTLVblen
 * @memberOf ASN1HEX
 * @function
 * @param {String} h hexadecimal string of ASN.1 DER encoded data
 * @param {Number} idx string index to get ASN.1 TLV byte length
 * @return {Number} byte length of ASN.1 TLV
 * @since jsrsasign 9.1.5 asn1hex 1.1.11
 *
 * @description
 * This method returns a byte length of ASN.1 TLV at
 * specified string index.
 *
 * @example
 *                        v string indx=42
 * ASN1HEX.getTLVblen("...1303616161...", 42) &rarr; 10 (PrintableString 'aaa')
 */
ASN1HEX.getTLVblen = function(h, idx) {
  return 2 + ASN1HEX.getLblen(h, idx) * 2 + ASN1HEX.getVblen(h, idx) * 2;
};

/**
 * get ASN.1 value starting string position for ASN.1 object refered by index 'idx'.
 * @name getVidx
 * @memberOf ASN1HEX
 * @function
 * @param {String} s hexadecimal string of ASN.1 DER encoded data
 * @param {Number} idx string index
 * @since jsrsasign 7.2.0 asn1hex 1.1.11
 */
ASN1HEX.getVidx = function(s, idx) {
  var l_len = ASN1HEX.getLblen(s, idx);
  if (l_len < 0) return l_len;
  return idx + (l_len + 1) * 2;
};

/**
 * get hexadecimal string of ASN.1 V(value)<br/>
 * @name getV
 * @memberOf ASN1HEX
 * @function
 * @param {String} s hexadecimal string of ASN.1 DER encoded data
 * @param {Number} idx string index
 * @return {String} hexadecimal string of ASN.1 value.
 * @since jsrsasign 7.2.0 asn1hex 1.1.11
 */
ASN1HEX.getV = function(s, idx) {
  var idx1 = ASN1HEX.getVidx(s, idx);
  var blen = ASN1HEX.getVblen(s, idx);
  return s.substr(idx1, blen * 2);
};

/**
 * get hexadecimal string of ASN.1 TLV at<br/>
 * @name getTLV
 * @memberOf ASN1HEX
 * @function
 * @param {String} s hexadecimal string of ASN.1 DER encoded data
 * @param {Number} idx string index
 * @return {String} hexadecimal string of ASN.1 TLV.
 * @since jsrsasign 7.2.0 asn1hex 1.1.11
 */
ASN1HEX.getTLV = function(s, idx) {
  return s.substr(idx, 2) + ASN1HEX.getL(s, idx) + ASN1HEX.getV(s, idx);
};

/**
 * parse ASN.1 DER encoded ECDSA signature
 * @name parseSigHexInHexRS
 * @memberOf KJUR.crypto.ECDSA
 * @function
 * @static
 * @param {String} sigHex hexadecimal string of ECDSA signature value
 * @return {Array} associative array of signature field r and s in hexadecimal
 * @since ecdsa-modified 1.0.3
 * @see {@link KJUR.crypto.ECDSA.parseSigHex}
 * @see {@link ASN1HEX.checkStrictDER}
 * @throws Error when signature value is malformed.
 * @example
 * var ec = new KJUR.crypto.ECDSA({'curve': 'secp256r1'});
 * var sig = ec.parseSigHexInHexRS('30...');
 * var hR = sig.r; // hexadecimal string for 'r' field of signature.
 * var hS = sig.s; // hexadecimal string for 's' field of signature.
 */
KJUR.crypto.ECDSA.parseSigHexInHexRS = function(sigHex) {
  var _ASN1HEX = ASN1HEX,
    _getChildIdx = _ASN1HEX.getChildIdx,
    _getV = _ASN1HEX.getV;

  // 1. strict DER check
  _ASN1HEX.checkStrictDER(sigHex, 0);

  // 2. ASN.1 Sequence Check
  if (sigHex.substr(0, 2) != '30')
    throw new Error('signature is not a ASN.1 sequence');

  // 2. Items of ASN.1 Sequence Check
  var a = _getChildIdx(sigHex, 0);
  if (a.length != 2)
    throw new Error('signature shall have two elements');

  // 3. Integer tag check
  var iTLV1 = a[0];
  var iTLV2 = a[1];

  if (sigHex.substr(iTLV1, 2) != '02')
    throw new Error('1st item not ASN.1 integer');
  if (sigHex.substr(iTLV2, 2) != '02')
    throw new Error('2nd item not ASN.1 integer');

  // 4. getting value and least zero check for DER
  var hR = _getV(sigHex, iTLV1);
  var hS = _getV(sigHex, iTLV2);

  return {'r': hR, 's': hS};
};

/**
 * convert hexadecimal ASN.1 encoded signature to concatinated signature
 * @name asn1SigToConcatSig
 * @memberOf KJUR.crypto.ECDSA
 * @function
 * @static
 * @param {String} asn1Hex hexadecimal string of ASN.1 encoded ECDSA signature value
 * @return {String} r-s concatinated format of ECDSA signature value
 * @throws Error when signature length is unsupported
 * @since ecdsa-modified 1.0.3
 */
KJUR.crypto.ECDSA.asn1SigToConcatSig = function(asn1Sig) {
  var pSig = KJUR.crypto.ECDSA.parseSigHexInHexRS(asn1Sig);
  var hR = pSig.r;
  var hS = pSig.s;

  // P-521 special case (65-66 bytes are allowed)
  if (hR.length >= 130 && hR.length <= 134) {
    if (hR.length % 2 != 0) {
      throw Error('unknown ECDSA sig r length error');
    }
    if (hS.length % 2 != 0) {
      throw Error('unknown ECDSA sig s length error');
    }
    if (hR.substr(0, 2) == '00') hR = hR.substr(2);
    if (hS.substr(0, 2) == '00') hS = hS.substr(2);

    // make sure they have the same length
    var length = Math.max(hR.length, hS.length);
    hR = ('000000' + hR).slice(- length);
    hS = ('000000' + hS).slice(- length);

    return hR + hS;
  }

  // R and S length is assumed multiple of 128bit(32chars in hex).
  // If leading is "00" and modulo of length is 2(chars) then
  // leading "00" is for two's complement and will be removed.
  if (hR.substr(0, 2) == '00' && (hR.length % 32) == 2)
    hR = hR.substr(2);

  if (hS.substr(0, 2) == '00' && (hS.length % 32) == 2)
    hS = hS.substr(2);

  // R and S length is assumed multiple of 128bit(32chars in hex).
  // If missing two chars then it will be padded by "00".
  if ((hR.length % 32) == 30) hR = '00' + hR;
  if ((hS.length % 32) == 30) hS = '00' + hS;

  // If R and S length is not still multiple of 128bit(32 chars),
  // then error
  if (hR.length % 32 != 0)
    throw Error('unknown ECDSA sig r length error');
  if (hS.length % 32 != 0)
    throw Error('unknown ECDSA sig s length error');

  return hR + hS;
};

/**
 * convert hexadecimal concatinated signature to ASN.1 encoded signature
 * @name concatSigToASN1Sig
 * @memberOf KJUR.crypto.ECDSA
 * @function
 * @static
 * @param {String} concatSig r-s concatinated format of ECDSA signature value
 * @return {String} hexadecimal string of ASN.1 encoded ECDSA signature value
 * @throws Error when signature length is unsupported
 * @since ecdsa-modified 1.0.3
 */
KJUR.crypto.ECDSA.concatSigToASN1Sig = function(concatSig) {
  if (concatSig.length % 4 != 0) {
    throw Error('unknown ECDSA concatinated r-s sig length error');
  }

  var hR = concatSig.substr(0, concatSig.length / 2);
  var hS = concatSig.substr(concatSig.length / 2);
  return KJUR.crypto.ECDSA.hexRSSigToASN1Sig(hR, hS);
};

/**
 * convert hexadecimal R and S value of signature to ASN.1 encoded signature
 * @name hexRSSigToASN1Sig
 * @memberOf KJUR.crypto.ECDSA
 * @function
 * @static
 * @param {String} hR hexadecimal string of R field of ECDSA signature value
 * @param {String} hS hexadecimal string of S field of ECDSA signature value
 * @return {String} hexadecimal string of ASN.1 encoded ECDSA signature value
 * @since ecdsa-modified 1.0.3
 */
KJUR.crypto.ECDSA.hexRSSigToASN1Sig = function(hR, hS) {
  var biR = new BigInteger(hR, 16);
  var biS = new BigInteger(hS, 16);
  return KJUR.crypto.ECDSA.biRSSigToASN1Sig(biR, biS);
};

/**
 * convert R and S BigInteger object of signature to ASN.1 encoded signature
 * @name biRSSigToASN1Sig
 * @memberOf KJUR.crypto.ECDSA
 * @function
 * @static
 * @param {BigInteger} biR BigInteger object of R field of ECDSA signature value
 * @param {BigInteger} biS BIgInteger object of S field of ECDSA signature value
 * @return {String} hexadecimal string of ASN.1 encoded ECDSA signature value
 * @since ecdsa-modified 1.0.3
 */
KJUR.crypto.ECDSA.biRSSigToASN1Sig = function(biR, biS) {
  var _KJUR_asn1 = KJUR.asn1;
  var derR = new _KJUR_asn1.DERInteger({'bigint': biR});
  var derS = new _KJUR_asn1.DERInteger({'bigint': biS});
  var derSeq = new _KJUR_asn1.DERSequence({'array': [derR, derS]});
  return derSeq.tohex();
};

/**
 * base class for ASN.1 DER encoder object<br/>
 * @name KJUR.asn1.ASN1Object
 * @class base class for ASN.1 DER encoder object
 * @param {Array} params JSON object parameter for constructor
 * @property {Boolean} isModified flag whether internal data was changed
 * @property {Array} params JSON object parameter for ASN.1 encode
 * @property {String} hTLV hexadecimal string of ASN.1 TLV
 * @property {String} hT hexadecimal string of ASN.1 TLV tag(T)
 * @property {String} hL hexadecimal string of ASN.1 TLV length(L)
 * @property {String} hV hexadecimal string of ASN.1 TLV value(V)
 *
 * @description
 * This class is ASN.1 DER object encode base class.
 * 
 * @example
 * new KJUR.asn1.ASN1Object({tlv: "030101"})
 */
KJUR.asn1.ASN1Object = function(params) {
  var isModified = true;
  var hTLV = null;
  var hT = '00';
  var hL = '00';
  var hV = '';
  this.params = null;

  /**
     * get hexadecimal ASN.1 TLV length(L) bytes from TLV value(V)<br/>
     * @name getLengthHexFromValue
     * @memberOf KJUR.asn1.ASN1Object#
     * @function
     * @return {String} hexadecimal string of ASN.1 TLV length(L)
     */
  this.getLengthHexFromValue = function() {
    if (typeof this.hV == 'undefined' || this.hV == null) {
      throw new Error('this.hV is null or undefined');
    }
    if (this.hV.length % 2 == 1) {
      throw new Error('value hex must be even length: n=' +
			    hV.length + ',v=' + this.hV);
    }
    var n = this.hV.length / 2;
    var hN = n.toString(16);
    if (hN.length % 2 == 1) {
      hN = '0' + hN;
    }
    if (n < 128) {
      return hN;
    } else {
      var hNlen = hN.length / 2;
      if (hNlen > 15) {
        throw new Error('ASN.1 length too long to represent by 8x: n = '
				+ n.toString(16));
      }
      var head = 128 + hNlen;
      return head.toString(16) + hN;
    }
  };

  /**
     * get hexadecimal string of ASN.1 TLV bytes<br/>
     * @name tohex
     * @memberOf KJUR.asn1.ASN1Object#
     * @function
     * @return {String} hexadecimal string of ASN.1 TLV
     * @since jsrsasign 10.5.16 asn1 1.0.24
     * @see KJUR.asn1.ASN1Object#getEncodedHex
     * @example
     * ...ASN1ObjectInstance.tohex() &rarr; "3003020101"
     */
  this.tohex = function() {
    if (this.hTLV == null || this.isModified) {
      this.hV = this.getFreshValueHex();
      this.hL = this.getLengthHexFromValue();
      this.hTLV = this.hT + this.hL + this.hV;
      this.isModified = false;
      //alert("first time: " + this.hTLV);
    }
    return this.hTLV;
  };

  /**
     * get hexadecimal string of ASN.1 TLV bytes (DEPRECATED)<br/>
     * @name getEncodedHex
     * @memberOf KJUR.asn1.ASN1Object#
     * @function
     * @return {String} hexadecimal string of ASN.1 TLV
     * @deprecated since jsrsasign 10.5.16 please use {@link KJUR.asn1.ASN1Object#tohex}
     */
  this.getEncodedHex = function() { return this.tohex(); };

  /**
     * get hexadecimal string of ASN.1 TLV value(V) bytes
     * @name getValueHex
     * @memberOf KJUR.asn1.ASN1Object#
     * @function
     * @return {String} hexadecimal string of ASN.1 TLV value(V) bytes
     */
  this.getValueHex = function() {
    this.tohex();
    return this.hV;
  }

  this.getFreshValueHex = function() {
    return '';
  };

  this.setByParam = function(params) {
    this.params = params;
  };

  if (params != undefined) {
    if (params.tlv != undefined) {
	    this.hTLV = params.tlv;
	    this.isModified = false;
    }
  }
};

// ********************************************************************
/**
 * class for ASN.1 DER Enumerated
 * @name KJUR.asn1.DEREnumerated
 * @class class for ASN.1 DER Enumerated
 * @extends KJUR.asn1.ASN1Object
 * @description
 * <br/>
 * As for argument 'params' for constructor, you can specify one of
 * following properties:
 * <ul>
 * <li>int - specify initial ASN.1 value(V) by integer value</li>
 * <li>hex - specify initial ASN.1 value(V) by a hexadecimal string</li>
 * </ul>
 * NOTE: 'params' can be omitted.
 * @example
 * new KJUR.asn1.DEREnumerated(123);
 * new KJUR.asn1.DEREnumerated({int: 123});
 * new KJUR.asn1.DEREnumerated({hex: '1fad'});
 */
KJUR.asn1.DEREnumerated = function(params) {
  KJUR.asn1.DEREnumerated.superclass.constructor.call(this);
  this.hT = '0a';

  /**
     * set value by Tom Wu's BigInteger object
     * @name setByBigInteger
     * @memberOf KJUR.asn1.DEREnumerated#
     * @function
     * @param {BigInteger} bigIntegerValue to set
     */
  this.setByBigInteger = function(bigIntegerValue) {
    this.hTLV = null;
    this.isModified = true;
    this.hV = twoscompl(bigIntegerValue);
  };

  /**
     * set value by integer value
     * @name setByInteger
     * @memberOf KJUR.asn1.DEREnumerated#
     * @function
     * @param {Integer} integer value to set
     */
  this.setByInteger = function(intValue) {
    var bi = new BigInteger(String(intValue), 10);
    this.setByBigInteger(bi);
  };

  /**
     * set value by integer value
     * @name setValueHex
     * @memberOf KJUR.asn1.DEREnumerated#
     * @function
     * @param {String} hexadecimal string of integer value
     * @description
     * <br/>
     * NOTE: Value shall be represented by minimum octet length of
     * two's complement representation.
     */
  this.setValueHex = function(newHexString) {
    this.hV = newHexString;
  };

  this.getFreshValueHex = function() {
    return this.hV;
  };

  if (typeof params != 'undefined') {
    if (typeof params['int'] != 'undefined') {
      this.setByInteger(params['int']);
    } else if (typeof params == 'number') {
      this.setByInteger(params);
    } else if (typeof params['hex'] != 'undefined') {
      this.setValueHex(params['hex']);
    }
  }
};
extendClass(KJUR.asn1.DEREnumerated, KJUR.asn1.ASN1Object);

// == BEGIN DERAbstractString ================================================
/**
 * base class for ASN.1 DER string classes
 * @name KJUR.asn1.DERAbstractString
 * @class base class for ASN.1 DER string classes
 * @param {Array} params associative array of parameters (ex. {'str': 'aaa'})
 * @property {String} s internal string of value
 * @extends KJUR.asn1.ASN1Object
 * @description
 * <br/>
 * As for argument 'params' for constructor, you can specify one of
 * following properties:
 * <ul>
 * <li>str - specify initial ASN.1 value(V) by a string</li>
 * <li>hex - specify initial ASN.1 value(V) by a hexadecimal string</li>
 * </ul>
 * NOTE: 'params' can be omitted.
 */
KJUR.asn1.DERAbstractString = function(params) {
  KJUR.asn1.DERAbstractString.superclass.constructor.call(this);
  var s = null;
  var hV = null;

  /**
     * get string value of this string object
     * @name getString
     * @memberOf KJUR.asn1.DERAbstractString#
     * @function
     * @return {String} string value of this string object
     */
  this.getString = function() {
    return this.s;
  };

  /**
     * set value by a string
     * @name setString
     * @memberOf KJUR.asn1.DERAbstractString#
     * @function
     * @param {String} newS value by a string to set
     * @description
     * This method set value by string. <br/>
     * NOTE: This method assumes that the argument string is
     * UTF-8 encoded even though ASN.1 primitive 
     * such as IA5String or PrintableString doesn't
     * support all of UTF-8 characters.
     * @example
     * o = new KJUR.asn1.DERIA5String();
     * o.setString("abc");
     * o.setString("あいう");
     */
  this.setString = function(newS) {
    this.hTLV = null;
    this.isModified = true;
    this.s = newS;
    this.hV = utf8tohex(this.s).toLowerCase();
  };

  /**
     * set value by a hexadecimal string
     * @name setStringHex
     * @memberOf KJUR.asn1.DERAbstractString#
     * @function
     * @param {String} newHexString value by a hexadecimal string to set
     */
  this.setStringHex = function(newHexString) {
    this.hTLV = null;
    this.isModified = true;
    this.s = null;
    this.hV = newHexString;
  };

  this.getFreshValueHex = function() {
    return this.hV;
  };

  if (typeof params != 'undefined') {
    if (typeof params == 'string') {
      this.setString(params);
    } else if (typeof params['str'] != 'undefined') {
      this.setString(params['str']);
    } else if (typeof params['hex'] != 'undefined') {
      this.setStringHex(params['hex']);
    }
  }
};
extendClass(KJUR.asn1.DERAbstractString, KJUR.asn1.ASN1Object);
// == END   DERAbstractString ================================================

// == BEGIN DERAbstractStructured ============================================
/**
 * base class for ASN.1 DER structured class
 * @name KJUR.asn1.DERAbstractStructured
 * @class base class for ASN.1 DER structured class
 * @property {Array} asn1Array internal array of ASN1Object
 * @extends KJUR.asn1.ASN1Object
 * @description
 * @see KJUR.asn1.ASN1Object - superclass
 */
KJUR.asn1.DERAbstractStructured = function(params) {
  KJUR.asn1.DERAbstractString.superclass.constructor.call(this);
  var asn1Array = null;

  /**
     * set value by array of ASN1Object
     * @name setByASN1ObjectArray
     * @memberOf KJUR.asn1.DERAbstractStructured#
     * @function
     * @param {array} asn1ObjectArray array of ASN1Object to set
     */
  this.setByASN1ObjectArray = function(asn1ObjectArray) {
    this.hTLV = null;
    this.isModified = true;
    this.asn1Array = asn1ObjectArray;
  };

  /**
     * append an ASN1Object to internal array
     * @name appendASN1Object
     * @memberOf KJUR.asn1.DERAbstractStructured#
     * @function
     * @param {ASN1Object} asn1Object to add
     */
  this.appendASN1Object = function(asn1Object) {
    this.hTLV = null;
    this.isModified = true;
    this.asn1Array.push(asn1Object);
  };

  this.asn1Array = new Array();
  if (typeof params != 'undefined') {
    if (typeof params['array'] != 'undefined') {
      this.asn1Array = params['array'];
    }
  }
};
extendClass(KJUR.asn1.DERAbstractStructured, KJUR.asn1.ASN1Object);

// ********************************************************************
/**
 * class for ASN.1 DER Integer
 * @name KJUR.asn1.DERInteger
 * @class class for ASN.1 DER Integer
 * @extends KJUR.asn1.ASN1Object
 * @description
 * <br/>
 * As for argument 'params' for constructor, you can specify one of
 * following properties:
 * <ul>
 * <li>int - specify initial ASN.1 value(V) by integer value</li>
 * <li>bigint - specify initial ASN.1 value(V) by BigInteger object</li>
 * <li>hex - specify initial ASN.1 value(V) by a hexadecimal string</li>
 * </ul>
 * NOTE: 'params' can be omitted.
 */
KJUR.asn1.DERInteger = function(params) {
  KJUR.asn1.DERInteger.superclass.constructor.call(this);
  this.hT = '02';
  this.params = null;
  var _biToTwoCompl = twoscompl;

  /**
     * set value by Tom Wu's BigInteger object
     * @name setByBigInteger
     * @memberOf KJUR.asn1.DERInteger#
     * @function
     * @param {BigInteger} bigIntegerValue to set
     */
  this.setByBigInteger = function(bigIntegerValue) {
    this.isModified = true;
    this.params = { bigint: bigIntegerValue };
  };

  /**
     * set value by integer value
     * @name setByInteger
     * @memberOf KJUR.asn1.DERInteger
     * @function
     * @param {Integer} integer value to set
     */
  this.setByInteger = function(intValue) {
    this.isModified = true;
    this.params = intValue;
  };

  /**
     * set value by integer value
     * @name setValueHex
     * @memberOf KJUR.asn1.DERInteger#
     * @function
     * @param {String} hexadecimal string of integer value
     * @description
     * <br/>
     * NOTE: Value shall be represented by minimum octet length of
     * two's complement representation.
     * @example
     * new KJUR.asn1.DERInteger(123);
     * new KJUR.asn1.DERInteger({'int': 123});
     * new KJUR.asn1.DERInteger({'hex': '1fad'});
     * new KJUR.asn1.DERInteger({'bigint': new BigInteger("1234", 10)});
     */
  this.setValueHex = function(newHexString) {
    this.isModified = true;
    this.params = { hex: newHexString };
  };

  this.getFreshValueHex = function() {
    var params = this.params;
    var bi = null;
    if (params == null) throw new Error('value not set');

    if (typeof params == 'object' && params.hex != undefined) {
	    this.hV = params.hex;
      return this.hV;
    }

    if (typeof params == 'number') {
	    bi = new BigInteger(String(params), 10);
    } else if (params['int'] != undefined) {
	    bi = new BigInteger(String(params['int']), 10);
    } else if (params.bigint != undefined) {
	    bi = params.bigint;
    } else {
	    throw new Error('wrong parameter');
    }
    this.hV = _biToTwoCompl(bi);
    return this.hV;
  };

  if (params != undefined) {
    this.params = params;
  }
};
extendClass(KJUR.asn1.DERInteger, KJUR.asn1.ASN1Object);

// ********************************************************************
/**
 * class for ASN.1 DER Sequence
 * @name KJUR.asn1.DERSequence
 * @class class for ASN.1 DER Sequence
 * @extends KJUR.asn1.DERAbstractStructured
 * @description
 * <br/>
 * As for argument 'params' for constructor, you can specify one of
 * following properties:
 * <ul>
 * <li>array - specify array of ASN1Object to set elements of content</li>
 * </ul>
 * NOTE: 'params' can be omitted.
 */
KJUR.asn1.DERSequence = function(params) {
  KJUR.asn1.DERSequence.superclass.constructor.call(this, params);
  this.hT = '30';
  this.getFreshValueHex = function() {
    var h = '';
    for (var i = 0; i < this.asn1Array.length; i++) {
      var asn1Obj = this.asn1Array[i];
      h += asn1Obj.tohex();
    }
    this.hV = h;
    return this.hV;
  };
};
extendClass(KJUR.asn1.DERSequence, KJUR.asn1.DERAbstractStructured);

/**
 * get hexadecimal string of minimum two's complement of BigInteger<br/>
 * @name twoscompl
 * @function
 * @param {BigInteger} bi BigInteger object
 * @return {string} hexadecimal string of two's complement of the integer
 * @since jsrsasign 10.9.0 base64x 1.1.34
 * @see inttohex
 *
 * @description
 * This static method converts from a BigInteger object to a minimum length
 * hexadecimal string of two's complement of the integer.
 * <br/>
 * NOTE: This function is a replacement of deprecated ASN1Util.bigIntToMinTwosComplementsHex method.
 *
 * @example
 * twoscompl(new BigInteger("1", 10)) &rarr; "01"
 * twoscompl(new BigInteger("-1", 10)) &rarr; "ff"
 */
function twoscompl(bi) {
  var h = bi.toString(16);
  // positive
  if (h.substr(0, 1) != '-') {
    if (h.length % 2 == 1) {
	    h = '0' + h;
    } else {
	    if (! h.match(/^[0-7]/)) {
        h = '00' + h;
	    }
    }
    return h;
  }
  // negative
  var hPos = h.substr(1);
  var xorLen = hPos.length;
  if (xorLen % 2 == 1) {
    xorLen += 1;
  } else {
    if (! h.match(/^[0-7]/)) {
      xorLen += 2;
    }
  }
  var hMask = '';
  for (var i = 0; i < xorLen; i++) {
    hMask += 'f';
  }
  var biMask = new BigInteger(hMask, 16);
  var biNeg = biMask.xor(bi).add(BigInteger.ONE);
  h = biNeg.toString(16).replace(/^-/, '');
  return h;
}

// =======================================================
/**
 * set class inheritance<br/>
 * @name extendClass
 * @function
 * @param {Function} subClass sub class to set inheritance
 * @param {Function} superClass super class to inherit
 * @since jsrsasign 10.3.0 base64x 1.1.21
 *
 * @description
 * This function extends a class and set an inheritance
 * for member variables and methods.
 *
 * @example
 * var Animal = function() {
 *   this.hello = function(){console.log("Hello")};
 *   this.name="Ani";
 * };
 * var Dog = function() {
 *   Dog.superclass.constructor.call(this);
 *   this.vow = function(){console.log("Vow wow")};
 *   this.tail=true;
 * };
 * extendClass(Dog, Animal);
 */
function extendClass(subClass, superClass) {
  var F = function() {};
  F.prototype = superClass.prototype;
  subClass.prototype = new F();
  subClass.prototype.constructor = subClass;
  subClass.superclass = superClass.prototype;
     
  if (superClass.prototype.constructor == Object.prototype.constructor) {
    superClass.prototype.constructor = superClass;
  }
};

function test () {
  const h1 ='00454a60d23ffe438b6a8b41e7c9752d41dc93540cec32ac42cb04d6e62ff4aba0a24445a48389541543ebb88f4ab25e7eea62c61dd3f871502262b59d38529607ce01fd1e54eafd9784796b8a4232e0fb4e6a15c7378f34c64c7890c08bbe433ab3e1aa60876fd5677ac83d9fb01bf123489e81aaef182b597e54d054d121412f4b7c63'
  const h2 = '3081870241454a60d23ffe438b6a8b41e7c9752d41dc93540cec32ac42cb04d6e62ff4aba0a24445a48389541543ebb88f4ab25e7eea62c61dd3f871502262b59d38529607ce024201fd1e54eafd9784796b8a4232e0fb4e6a15c7378f34c64c7890c08bbe433ab3e1aa60876fd5677ac83d9fb01bf123489e81aaef182b597e54d054d121412f4b7c63'
  const x1 = KJUR.crypto.ECDSA.concatSigToASN1Sig(h1)
  const x2 = KJUR.crypto.ECDSA.asn1SigToConcatSig(x1)
  if (x1 === h2)
    console.log('ok 1')
  if (x2 === h1)
    console.log('ok 2')
}
// test()