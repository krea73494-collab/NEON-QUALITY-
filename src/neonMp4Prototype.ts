/*
 * NEON COMPRESS - Experimental MP4 Prototype
 * Preserves encoded video/audio without re-encoding.
 * Supports MP4 files with moov after mdat.
 */

type Mp4Box = {
  type: string;
  start: number;
  end: number;
  headerSize: number;
};

const encoder = new TextEncoder();

function u32(value: number): Uint8Array {
  const result = new Uint8Array(4);
  new DataView(result.buffer).setUint32(0, value, false);
  return result;
}

function u64(value: bigint): Uint8Array {
  const result = new Uint8Array(8);
  new DataView(result.buffer).setBigUint64(0, value, false);
  return result;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const length = arrays.reduce((sum, item) => sum + item.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;

  for (const item of arrays) {
    result.set(item, offset);
    offset += item.length;
  }

  return result;
}

function makeBox(type: string, payload: Uint8Array): Uint8Array {
  const size = payload.length + 8;
  if (size > 0xffffffff) {
    throw new Error("MP4 box is too large.");
  }

  return concat(u32(size), encoder.encode(type), payload);
}

function parseBoxes(
  data: Uint8Array,
  start = 0,
  end = data.length,
): Mp4Box[] {
  const boxes: Mp4Box[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  let offset = start;

  while (offset < end) {
    if (offset + 8 > end) {
      throw new Error("Invalid MP4 box header.");
    }

    const size32 = view.getUint32(offset, false);
    const type = String.fromCharCode(...data.subarray(offset + 4, offset + 8));

    let size = size32;
    let headerSize = 8;

    if (size32 === 1) {
      if (offset + 16 > end) {
        throw new Error("Invalid extended MP4 box.");
      }

      const extended = view.getBigUint64(offset + 8, false);

      if (extended > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("MP4 box is too large.");
      }

      size = Number(extended);
      headerSize = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }

    if (size < headerSize || offset + size > end) {
      throw new Error("Invalid MP4 box size.");
    }

    boxes.push({
      type,
      start: offset,
      end: offset + size,
      headerSize,
    });

    offset += size;
  }

  return boxes;
}

function convertMvhd(data: Uint8Array): Uint8Array {
  if (data.length < 108 || data[8] !== 0) {
    throw new Error("Unsupported mvhd format.");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const flags = data.slice(9, 12);
  const creation = BigInt(view.getUint32(12, false));
  const modification = BigInt(view.getUint32(16, false));
  const timescale = view.getUint32(20, false);

  const rest = data.slice(28);

  const payload = concat(
    new Uint8Array([1]),
    flags,
    u64(creation),
    u64(modification),
    u32(timescale),
    u64(0xffffffffffffffffn),
    rest,
  );

  return makeBox("mvhd", payload);
}

function metadata(): Uint8Array {
  function dataBox(text: string): Uint8Array {
    return makeBox(
      "data",
      concat(u32(1), u32(0), encoder.encode(text)),
    );
  }

  const comment = makeBox(
    "\u00a9cmt",
    dataBox("Patched by NEON COMPRESS"),
  );

  const encodedBy = makeBox(
    "\u00a9too",
    dataBox("NEON COMPRESS Prototype V1"),
  );

  const ilst = makeBox("ilst", concat(comment, encodedBy));

  const handler = makeBox(
    "hdlr",
    concat(
      u32(0),
      u32(0),
      encoder.encode("mdir"),
      encoder.encode("appl"),
      new Uint8Array(9),
    ),
  );

  const meta = makeBox(
    "meta",
    concat(u32(0), handler, ilst),
  );

  return makeBox("udta", meta);
}

export function neonMp4Prototype(input: Uint8Array): Uint8Array {
  const top = parseBoxes(input);

  const moov = top.find((item) => item.type === "moov");
  const mdat = top.find((item) => item.type === "mdat");

  if (!moov || !mdat) {
    throw new Error("MP4 must contain moov and mdat boxes.");
  }

  if (moov.start < mdat.end) {
    throw new Error(
      "This MP4 layout is not supported by the prototype.",
    );
  }

  const children = parseBoxes(
    input,
    moov.start + moov.headerSize,
    moov.end,
  );

  const updatedChildren = children.map((item) => {
    const content = input.slice(item.start, item.end);

    return item.type === "mvhd"
      ? convertMvhd(content)
      : content;
  });

  if (!children.some((item) => item.type === "mvhd")) {
    throw new Error("MP4 mvhd box not found.");
  }

  const updatedMoov = makeBox(
    "moov",
    concat(...updatedChildren, metadata()),
  );

  const output: Uint8Array[] = [];

  for (const item of top) {
    output.push(
      item.type === "moov"
        ? updatedMoov
        : input.slice(item.start, item.end),
    );
  }

  output.push(makeBox("free", new Uint8Array(61)));

  return concat(...output);
}
