// Paste as Keystrokes – background.js (v1.5, canvas-safe with full US symbol map)

// ---- setup
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "paste-as-typing", title: "Paste as typing", contexts: ["all"] });
});
chrome.contextMenus.onClicked.addListener((info, tab) => { if (info.menuItemId === "paste-as-typing" && tab?.id) run(tab.id); });
chrome.action.onClicked.addListener((tab) => { if (tab?.id) run(tab.id); });

let abortFlag = false;
chrome.commands.onCommand.addListener((cmd, tab) => {
  if (cmd === "paste_as_typing" && tab?.id) run(tab.id);
  if (cmd === "paste_as_typing_stop") abortFlag = true; // panic stop
});

// ---- main entry
async function run(tabId) {
  abortFlag = false;

  let text = await tryReadClipboard(tabId);
  if (!text) text = await promptForText(tabId);
  if (!text) return;

  const { cps, enterAsReturn } = await getOptions();

  const ok = await typeViaCDP(tabId, text, Number(cps) || 20, !!enterAsReturn);
  if (!ok) {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: domTyperFallback,
      args: [text, Number(cps) || 20, !!enterAsReturn]
    });
  }
}

// ---- options
function getOptions() {
  return new Promise((res) => chrome.storage.sync.get({ cps: 20, enterAsReturn: true }, (o) => res(o)));
}

// ---- clipboard helpers
async function tryReadClipboard(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => { try { return await navigator.clipboard.readText(); } catch { return ""; } }
    });
    return result || "";
  } catch { return ""; }
}
async function promptForText(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.prompt("Paste as Typing: clipboard blocked.\nPaste your text here:") || ""
    });
    return result || "";
  } catch { return ""; }
}

// ---- constants
const SHIFT = 8;

// US keyboard mapping
const US_MAP = {
  // digits + symbols
  '1': {code:'Digit1', key:'1', vk:49}, '!': {code:'Digit1', key:'1', vk:49, shift:true},
  '2': {code:'Digit2', key:'2', vk:50}, '@': {code:'Digit2', key:'2', vk:50, shift:true},
  '3': {code:'Digit3', key:'3', vk:51}, '#': {code:'Digit3', key:'3', vk:51, shift:true},
  '4': {code:'Digit4', key:'4', vk:52}, '$': {code:'Digit4', key:'4', vk:52, shift:true},
  '5': {code:'Digit5', key:'5', vk:53}, '%': {code:'Digit5', key:'5', vk:53, shift:true},
  '6': {code:'Digit6', key:'6', vk:54}, '^': {code:'Digit6', key:'6', vk:54, shift:true},
  '7': {code:'Digit7', key:'7', vk:55}, '&': {code:'Digit7', key:'7', vk:55, shift:true},
  '8': {code:'Digit8', key:'8', vk:56}, '*': {code:'Digit8', key:'8', vk:56, shift:true},
  '9': {code:'Digit9', key:'9', vk:57}, '(': {code:'Digit9', key:'9', vk:57, shift:true},
  '0': {code:'Digit0', key:'0', vk:48}, ')': {code:'Digit0', key:'0', vk:48, shift:true},
  '-': {code:'Minus', key:'-', vk:189}, '_': {code:'Minus', key:'-', vk:189, shift:true},
  '=': {code:'Equal', key:'=', vk:187}, '+': {code:'Equal', key:'=', vk:187, shift:true},

  // brackets / punctuation
  '[':{code:'BracketLeft',key:'[',vk:219},'{':{code:'BracketLeft',key:'[',vk:219,shift:true},
  ']':{code:'BracketRight',key:']',vk:221},'}':{code:'BracketRight',key:']',vk:221,shift:true},
  '\\':{code:'Backslash',key:'\\',vk:220},'|':{code:'Backslash',key:'\\',vk:220,shift:true},
  ';':{code:'Semicolon',key:';',vk:186},':':{code:'Semicolon',key:';',vk:186,shift:true},
  "'":{code:'Quote',key:"'",vk:222},'"':{code:'Quote',key:"'",vk:222,shift:true},
  ',':{code:'Comma',key:',',vk:188},'<':{code:'Comma',key:',',vk:188,shift:true},
  '.':{code:'Period',key:'.',vk:190},'>':{code:'Period',key:'.',vk:190,shift:true},
  '/':{code:'Slash',key:'/',vk:191},'?':{code:'Slash',key:'/',vk:191,shift:true},
  '`':{code:'Backquote',key:'`',vk:192},'~':{code:'Backquote',key:'`',vk:192,shift:true},
  ' ': {code:'Space',key:' ',vk:32}
};
// letters
for (let c=65;c<=90;c++){
  const upper=String.fromCharCode(c), lower=upper.toLowerCase();
  US_MAP[lower]={code:'Key'+upper,key:lower,vk:c};
  US_MAP[upper]={code:'Key'+upper,key:lower,vk:c,shift:true};
}

// ---- core typer
async function typeViaCDP(tabId, text, cps, enterAsReturn) {
  const target = { tabId };
  const delay = Math.max(1, Math.floor(1000 / Math.max(1, cps)));

  try {
    await attach();
    await send("Page.bringToFront");

    await releaseAllModifiers();

    for (const raw of String(text)) {
      if (abortFlag) break;
      const ch = raw === "\r" ? "" : raw;
      if (!ch) continue;

      if (ch === "\n") {
        if (enterAsReturn) {
          await keyTapKD("Enter","Enter",13,"",0);
        } else {
          await keyTapKD("Enter","Enter",13,"\n",0);
        }
      } else if (ch === "\t") {
        await keyTapKD("Tab","Tab",9,"",0);
      } else {
        const m = US_MAP[ch];
        if (!m) continue;
        const mods = m.shift ? SHIFT : 0;
        // keyDown with printable text, then keyUp
        await send("Input.dispatchKeyEvent", {
          type:"keyDown",key:m.key,code:m.code,
          windowsVirtualKeyCode:m.vk,nativeVirtualKeyCode:m.vk,
          modifiers:mods,text:ch,unmodifiedText:m.key
        });
        await send("Input.dispatchKeyEvent", {
          type:"keyUp",key:m.key,code:m.code,
          windowsVirtualKeyCode:m.vk,nativeVirtualKeyCode:m.vk,modifiers:mods
        });
      }
      await sleep(delay);
    }

    await releaseAllModifiers();
    await detach();
    return true;
  } catch(e){
    console.warn("CDP failed:",e);
    try{await detach();}catch{}
    return false;
  }

  // --- helpers
  function attach(){return new Promise((res,rej)=>chrome.debugger.attach(target,"1.3",()=>chrome.runtime.lastError?rej(chrome.runtime.lastError):res()));}
  function detach(){return new Promise((res)=>chrome.debugger.detach(target,()=>res()));}
  function send(m,p={}){return new Promise((res,rej)=>chrome.debugger.sendCommand(target,m,p,(r)=>chrome.runtime.lastError?rej(chrome.runtime.lastError):res(r)));}
  async function keyTapKD(key,code,vk,text,mods){
    await send("Input.dispatchKeyEvent",{type:"keyDown",key,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk,text,unmodifiedText:text,modifiers:mods});
    await send("Input.dispatchKeyEvent",{type:"keyUp",key,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk,modifiers:mods});
  }
  async function releaseAllModifiers(){
    const mods=[{key:"Shift",vk:16,code:"ShiftLeft"},{key:"Control",vk:17,code:"ControlLeft"},{key:"Alt",vk:18,code:"AltLeft"},{key:"Meta",vk:91,code:"MetaLeft"}];
    for(const m of mods){await send("Input.dispatchKeyEvent",{type:"keyUp",key:m.key,code:m.code,windowsVirtualKeyCode:m.vk,nativeVirtualKeyCode:m.vk});}
  }
  function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
}

// ---- fallback for text boxes
function domTyperFallback(text, cps, enterAsReturn) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  function deepActiveElement(doc){let a=doc.activeElement||doc.body;try{while(a&&a.shadowRoot&&a.shadowRoot.activeElement)a=a.shadowRoot.activeElement;}catch{}return a||doc.body;}
  function isEditable(el){return!!el&&(el.isContentEditable||["input","textarea"].includes((el.tagName||"").toLowerCase()));}
  function insert(el,ch){
    if(document.execCommand){document.execCommand("insertText",false,ch);return;}
    if(typeof el.value==="string"){const s=el.selectionStart??el.value.length,e=el.selectionEnd??el.value.length;el.value=el.value.slice(0,s)+ch+el.value.slice(e);el.selectionStart=el.selectionEnd=s+ch.length;el.dispatchEvent(new Event("input",{bubbles:true}));}
    else{try{el.dispatchEvent(new InputEvent("input",{data:ch,inputType:"insertText",bubbles:true,cancelable:true}));}catch{}}
  }
  (async()=>{
    const d=Math.max(1,Math.floor(1000/Math.max(1,Number(cps)||20)));
    const el=deepActiveElement(document);
    if(!isEditable(el))return;
    for(const raw of String(text)){
      const ch=raw==="\r"?"":raw;if(!ch)continue;
      if(ch==="\n"&&enterAsReturn){["keydown","keyup"].forEach(t=>el.dispatchEvent(new KeyboardEvent(t,{key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:true})));}
      else insert(el,ch==="\n"?"\n":ch);
      // eslint-disable-next-line no-await-in-loop
      await sleep(d);
    }
  })();
}
