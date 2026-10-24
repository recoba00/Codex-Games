// 의존성 없는 최소 xlsx 리더(백오피스 업로드용). Workers·Node 공통: ZIP 해제(DecompressionStream) + 시트 XML의 셀 값.
// 수식 셀은 엑셀이 저장해 둔 결과값(<v>)을 읽는다(openpyxl data_only=True와 같음). 서식·병합·날짜 변환은 하지 않는다.
const td = new TextDecoder();

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unzip(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i -= 1) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("xlsx_invalid");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let n = 0; n < count; n += 1) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("xlsx_invalid");
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nlen));
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    files[name] = { method, data: u8.subarray(start, start + csize) };
    p += 46 + nlen + elen + clen;
  }
  return {
    names: Object.keys(files),
    async text(name) {
      const f = files[name];
      if (!f) return null;
      if (f.method === 0) return td.decode(f.data);
      if (f.method === 8) return td.decode(await inflateRaw(f.data));
      throw new Error("xlsx_compression_unsupported");
    }
  };
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export const unescapeXml = (s) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e]);
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? unescapeXml(m[1]) : null; };
const texts = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map((m) => unescapeXml(m[1] ?? "")).join("");

function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// 반환: { 시트이름: rows } — rows[r][c], r·c는 0부터(엑셀 1행 = rows[0]). 빈 칸은 null
export async function readXlsx(buf) {
  const zip = await unzip(buf);
  const wb = await zip.text("xl/workbook.xml");
  if (!wb) throw new Error("xlsx_invalid");
  const rels = (await zip.text("xl/_rels/workbook.xml.rels")) ?? "";
  const target = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) target[attr(m[0], "Id")] = attr(m[0], "Target");
  const sstXml = (await zip.text("xl/sharedStrings.xml")) ?? "";
  const sst = [...sstXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, "")));
  const out = {};
  for (const m of wb.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = attr(m[0], "name");
    let path = target[attr(m[0], "r:id")] ?? "";
    path = path.startsWith("/") ? path.slice(1) : `xl/${path.replace(/^\.\//, "")}`;
    const xml = await zip.text(path);
    if (!xml) continue;
    const rows = [];
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(` ${c[1]}`, "r");
      if (!ref) continue;
      const r = Number(ref.match(/\d+$/)[0]) - 1, col = colIndex(ref);
      const t = attr(` ${c[1]}`, "t") ?? "n";
      const body = c[2] ?? "";
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let val = null;
      if (t === "s") val = v === undefined ? null : sst[Number(v)] ?? null;
      else if (t === "inlineStr") val = texts(body);
      else if (t === "str") val = v === undefined ? null : unescapeXml(v);
      else if (t === "b") val = v === "1";
      else if (t === "e") val = null;
      else val = v === undefined || v === "" ? null : Number(v);
      if (val === "") val = null;
      (rows[r] ??= [])[col] = val;
    }
    for (let i = 0; i < rows.length; i += 1) {
      rows[i] ??= [];
      for (let j = 0; j < rows[i].length; j += 1) if (rows[i][j] === undefined) rows[i][j] = null;
    }
    out[name] = rows;
  }
  return out;
}
