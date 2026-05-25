// Minimal NBT writer for Minecraft .litematic export.
// Supports the tag types litematic needs: byte, short, int, long, string, list, compound, long_array.
// Tags are constructed via the nbt.* helpers. Root compound is serialized via writeNBT(name, root).

const TYPE = {
  END: 0,
  BYTE: 1,
  SHORT: 2,
  INT: 3,
  LONG: 4,
  FLOAT: 5,
  DOUBLE: 6,
  BYTE_ARRAY: 7,
  STRING: 8,
  LIST: 9,
  COMPOUND: 10,
  INT_ARRAY: 11,
  LONG_ARRAY: 12,
};

const nbt = {
  byte:      (v)          => ({ __t: "byte",      value: v }),
  short:     (v)          => ({ __t: "short",     value: v }),
  int:       (v)          => ({ __t: "int",       value: v }),
  long:      (v)          => ({ __t: "long",      value: BigInt(v) }),
  string:    (v)          => ({ __t: "string",    value: String(v) }),
  list:      (childType, values = []) => ({ __t: "list", childType, value: values }),
  compound:  (obj)        => ({ __t: "compound",  value: obj }),
  longArray: (values)     => ({ __t: "longArray", value: values.map((v) => BigInt(v)) }),
};

function typeByte(tag) {
  switch (tag.__t) {
    case "byte":      return TYPE.BYTE;
    case "short":     return TYPE.SHORT;
    case "int":       return TYPE.INT;
    case "long":      return TYPE.LONG;
    case "string":    return TYPE.STRING;
    case "list":      return TYPE.LIST;
    case "compound":  return TYPE.COMPOUND;
    case "longArray": return TYPE.LONG_ARRAY;
  }
  throw new Error("unknown NBT tag type: " + tag.__t);
}

class BufWriter {
  constructor() {
    this.chunks = [];
  }
  ubyte(v) {
    const b = Buffer.alloc(1);
    b.writeUInt8(v & 0xff);
    this.chunks.push(b);
  }
  short(v) {
    const b = Buffer.alloc(2);
    b.writeInt16BE(v);
    this.chunks.push(b);
  }
  int(v) {
    const b = Buffer.alloc(4);
    b.writeInt32BE(v);
    this.chunks.push(b);
  }
  long(v) {
    const b = Buffer.alloc(8);
    b.writeBigInt64BE(BigInt.asIntN(64, BigInt(v)));
    this.chunks.push(b);
  }
  string(s) {
    const buf = Buffer.from(s, "utf8");
    if (buf.length > 65535) throw new Error("NBT string > 65535 bytes");
    const len = Buffer.alloc(2);
    len.writeUInt16BE(buf.length);
    this.chunks.push(len, buf);
  }
  toBuffer() {
    return Buffer.concat(this.chunks);
  }
}

function writePayload(w, tag) {
  switch (tag.__t) {
    case "byte":   w.ubyte(tag.value & 0xff); return;
    case "short":  w.short(tag.value);        return;
    case "int":    w.int(tag.value);          return;
    case "long":   w.long(tag.value);         return;
    case "string": w.string(tag.value);       return;
    case "list": {
      const items = tag.value;
      const t = items.length === 0
        ? (tag.childType ?? TYPE.END)
        : typeByte(items[0]);
      w.ubyte(t);
      w.int(items.length);
      for (const item of items) writePayload(w, item);
      return;
    }
    case "compound": {
      const obj = tag.value;
      for (const key of Object.keys(obj)) {
        const child = obj[key];
        w.ubyte(typeByte(child));
        w.string(key);
        writePayload(w, child);
      }
      w.ubyte(TYPE.END);
      return;
    }
    case "longArray": {
      const arr = tag.value;
      w.int(arr.length);
      for (const v of arr) w.long(v);
      return;
    }
  }
  throw new Error("unsupported tag: " + tag.__t);
}

function writeNBT(rootName, rootCompound) {
  if (rootCompound.__t !== "compound") {
    throw new Error("root tag must be a compound");
  }
  const w = new BufWriter();
  w.ubyte(TYPE.COMPOUND);
  w.string(rootName);
  writePayload(w, rootCompound);
  return w.toBuffer();
}

module.exports = { nbt, writeNBT, TYPE };
