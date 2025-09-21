export async function waitForSizedElement(selector, { tries = 40, delay = 50 } = {}){
for (let i = 0; i < tries; i++) {
const el = document.querySelector(selector);
if (el && el.offsetWidth > 0 && el.offsetHeight > 0) return el;
await new Promise(r => setTimeout(r, delay));
}
throw new Error(`Element ${selector} nicht sichtbar/sized`);
}