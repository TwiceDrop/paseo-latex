import { mathCss } from "./assets.gen";

export interface MathDocumentOptions {
  html: string;
  id: string;
  fontSize: number;
  color: string;
  wrap?: boolean;
  lineHeight?: number;
  fontWeight?: string | number;
  linkColor?: string;
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

export function createMathDocument({
  html,
  id,
  fontSize,
  color,
  wrap = false,
  lineHeight,
  fontWeight,
  linkColor,
}: MathDocumentOptions): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; connect-src 'none'; img-src 'none'">
<style>${mathCss}
html,body{margin:0;padding:0;background:transparent;overflow-x:auto;overflow-y:hidden}
#math{display:inline-block;white-space:nowrap;padding:4px 2px}
.katex-display{margin:0}
#math.prose{display:block;white-space:normal;padding:1px 0 2px;font-family:sans-serif;overflow-wrap:anywhere}
.math-inline{white-space:nowrap}
strong{font-weight:600} code{font-family:monospace} a{color:inherit;text-decoration:underline}
</style></head><body><span id="math" data-id="${escapeAttribute(id)}" style="font-size:${fontSize}px;color:${escapeAttribute(color)}">${html}</span>
<script>
function measure(){
  var math=document.getElementById('math');
  var rect=math.getBoundingClientRect();
  var message={id:math.getAttribute('data-id'),width:Math.ceil(rect.width),height:Math.ceil(rect.height)};
  if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify(message));}
  window.parent.postMessage(message,'*');
}
window.__PASEO_MATH_UPDATE__=function(value){
  var math=document.getElementById('math');
  math.innerHTML=value.html;
  math.setAttribute('data-id',value.id);
  math.className=value.wrap?'prose':'';
  math.style.fontSize=value.fontSize+'px';
  math.style.color=value.color;
  math.style.lineHeight=value.wrap?(value.lineHeight?value.lineHeight+'px':'1.4'):'';
  math.style.fontWeight=value.fontWeight||'normal';
  var links=math.querySelectorAll('a');
  for(var i=0;i<links.length;i++){links[i].style.color=value.linkColor||value.color;}
  document.fonts.ready.then(measure);
  requestAnimationFrame(measure);
};
document.addEventListener('click',function(event){
  var link=event.target.closest&&event.target.closest('a');
  if(!link)return;
  event.preventDefault();
  var message={type:'link',id:document.getElementById('math').getAttribute('data-id'),href:link.getAttribute('href')};
  if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify(message));}
});
window.__PASEO_MATH_UPDATE__(${JSON.stringify({ html, id, fontSize, color, wrap, lineHeight, fontWeight, linkColor }).replaceAll("<", "\\u003c")});
window.addEventListener('resize',measure);
</script></body></html>`;
}

export interface MathDimensions {
  id: string;
  width: number;
  height: number;
}

export function parseMathDimensions(value: unknown): MathDimensions | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("id" in value && "width" in value && "height" in value)) return null;
  const { id, width, height } = value;
  if (typeof id !== "string" || typeof width !== "number" || typeof height !== "number")
    return null;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0 || width > 100_000 || height > 10_000) return null;
  return { id, width, height };
}
