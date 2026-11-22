function installThemeCustomizations(win) {
  if (win.AirlinkThemeCustomizations?.document === win.document) return win.AirlinkThemeCustomizations;
  const inherited = win.AirlinkThemeCustomizations?.exportState?.() || null;
  win.AirlinkThemeCustomizations?.dispose?.();
  const doc = win.document;
  const empty = () => ({ version: 1, light: [], dark: [] });
  let manifest = empty(), signature = '', mode = doc.documentElement.classList.contains('dark') ? 'dark' : 'light';
  let manual = false, observing = false, timer = 0, loading = 0;
  const records = new Map(), fetched = new Map();
  const consoles=new Map();
  function originalText(element){
    if(element?.tagName==='INPUT')return originalAttribute(element,'placeholder')||'';
    return textNodes(element).map(node=>{const prior=records.get(element)?.texts.get(node);return prior&&node.nodeValue===prior.expected?prior.original:node.nodeValue;}).join('').trim();
  }
  function recordContext(element){
    const node=element?.closest?.('[data-theme-record]')||element?.querySelector?.('[data-theme-record]');
    if(!node)return null;try{return {kind:node.getAttribute('data-theme-record'),values:JSON.parse(node.getAttribute('data-theme-fields')||'{}')};}catch{return null;}
  }
  function consoleFor(element){const root=element?.closest?.('[data-theme-console]');return consoles.get(root)||null;}
  function textBinding(element){
    if(consoleFor(element))return '{{console.output}}';
    const own=element?.getAttribute?.('data-theme-text');if(own&&own!=='{{value}}')return own;
    const nested=[...(element?.querySelectorAll?.('[data-theme-text]')||[])].filter(node=>node.getAttribute('data-theme-text')!=='{{value}}'&&!node.closest('svg'));
    if(!nested.length)return null;
    const walker=doc.createTreeWalker(element,win.NodeFilter.SHOW_TEXT),seen=new Set();let value='';
    while(walker.nextNode()){
      const node=walker.currentNode;if(node.parentElement?.closest('svg,script,style'))continue;
      const bound=node.parentElement?.closest('[data-theme-text]');
      if(bound&&bound!==element&&nested.includes(bound)){if(!seen.has(bound)){value+=bound.getAttribute('data-theme-text');seen.add(bound);}}
      else value+=node.nodeValue;
    }
    return value.trim();
  }
  function renderConsole(state,value){
    if(state.rendered===value)return;state.clear();state.write(value);state.rendered=value;
  }
  function registerConsole(element,term){
    if(!element||consoles.has(element))return;
    element.setAttribute('data-theme-console','');element.setAttribute('data-theme-text','{{console.output}}');
    const nativeReset=(term.reset||term.clear).bind(term);
    const state={element,write:term.write.bind(term),clear:()=>{state.painting=true;try{nativeReset();}finally{state.painting=false;}},output:'',rendered:'',handled:false,overridden:false,painting:false};consoles.set(element,state);
    term.write=(value,callback)=>{
      state.output=(state.output+String(value)).slice(-500000);state.handled=false;applyCurrent();
      if(!state.handled){state.write(value,callback);state.rendered=state.output;}else callback?.();
    };
    for(const method of ['clear','reset'])if(typeof term[method]==='function'){
      const original=term[method].bind(term);term[method]=()=>{if(state.painting)return original();state.output='';state.rendered='';original();applyCurrent();};
    }
    return state;
  }
  const imageVariable = /^\{\{[a-zA-Z0-9_.-]+\}\}$/;
  const languagePattern = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
  function currentLanguage() { const value = String(doc.documentElement?.getAttribute?.('lang') || doc.documentElement?.lang || 'en').trim(); return languagePattern.test(value) ? value : 'en'; }
  function ruleText(rule) { const language = currentLanguage(); if (rule.texts && Object.hasOwn(rule.texts, language)) return rule.texts[language]; const base = language.split('-')[0]; if (rule.texts && Object.hasOwn(rule.texts, base)) return rule.texts[base]; return rule.text; }
  const secretVariable =/pass(?:word)?(?:\b|[A-Z_.-]|$)|Pass(?:\b|[A-Z]|$)|secret|token|\.key\b/i;
  const variablePattern = /\{\{([a-zA-Z0-9_.-]+)\}\}/g;
  function listVariables(element) {
    const values = new Map(), add = (key, label, group, value, type = 'text') => values.set('{{'+key+'}}',{token:'{{'+key+'}}',label,group,type,value:value == null ? '' : String(value),available:value !== null && value !== undefined});
    try{const url=new win.URL(win.__demoLocation?.href||win.location?.href||doc.baseURI);if(url.pathname.includes('/files')){
      const directory=url.searchParams.get('path')||'/';add('file.directory','Directory path','File',directory);
      const edit=url.pathname.split('/files/edit/')[1];if(edit){const path=decodeURIComponent(edit);add('file.path','File path','File',path);add('file.name','File name','File',path.split('/').pop());}
    }}catch{}
    const local=recordContext(element);
    if(local&&['file','player','world','backup'].includes(local.kind))for(const [key,value]of Object.entries(local.values)){
      if(value===null||['string','number','boolean'].includes(typeof value))add(local.kind+'.'+key,key==='size'?'Size (bytes)':key[0].toUpperCase()+key.slice(1),local.kind[0].toUpperCase()+local.kind.slice(1),value);
    }
    const terminal=consoleFor(element)||consoles.values().next().value;
    if(terminal){add('console.output','Console output','Console',terminal.output);add('console.line','Latest console line','Console',terminal.output.replace(/\r/g,'').trimEnd().split('\n').at(-1)||'');}
    const scopeNodes=[];
    if(element){
      const row=itemRoot(element);
      if(row)for(const node of row.querySelectorAll?.('[data-theme-bindings]')||[])if(node!==element&&!element.contains?.(node))scopeNodes.push(node);
      const ancestors=[];for(let node=element.parentElement;node;node=node.parentElement)if(node.hasAttribute?.('data-theme-bindings'))ancestors.unshift(node);
      scopeNodes.push(...ancestors);
      scopeNodes.push(...(element.querySelectorAll?.('[data-theme-bindings]')||[]));
      if(element.hasAttribute?.('data-theme-bindings'))scopeNodes.push(element);
    }
    const scopeSet=new Set(scopeNodes);
    for(const node of [...(doc.querySelectorAll?.('[data-theme-bindings]')||[])].filter(node=>!scopeSet.has(node)).concat(scopeNodes)){
      let bindings;try{bindings=JSON.parse(node.getAttribute?.('data-theme-bindings')||'{}');}catch{continue;}
      const scoped=scopeSet.has(node);
      for(const [key,value]of Object.entries(bindings)){
        if(!/^[a-zA-Z0-9_.-]+$/.test(key)||secretVariable.test(key)||value!==null&&!['string','number','boolean'].includes(typeof value))continue;
        const live=node.getAttribute('data-theme-live')===key,token='{{'+key+'}}',previous=values.get(token);
        if(previous&&previous.available&&!scoped)continue;
        const resolved=live?originalText(node):value;
        values.set(token,{token,label:variableLabel(key),group:scoped?'This item':'This page',type:node.tagName==='IMG'&&(node.getAttribute('data-theme-image')||'').includes(token)?'image':'text',value:resolved==null?'':String(resolved),available:resolved!==null&&resolved!==undefined});
      }
    }
    return [...values.values()];
  }
  let itemRoots=new WeakMap();
  function itemRoot(element){
    if(itemRoots.has(element))return itemRoots.get(element);
    const root=findItemRoot(element);itemRoots.set(element,root);return root;
  }
  function findItemRoot(element){
    let root=null,depth=0;
    for(let node=element.parentElement;node&&node!==doc.body&&depth<12;node=node.parentElement,depth++){
      const seen=new Map();let conflict=false;
      for(const bound of node.querySelectorAll?.('[data-theme-bindings]')||[]){
        let bindings;try{bindings=JSON.parse(bound.getAttribute('data-theme-bindings')||'{}');}catch{continue;}
        for(const [key,value]of Object.entries(bindings)){const text=JSON.stringify(value);if(seen.has(key)&&seen.get(key)!==text){conflict=true;break;}seen.set(key,text);}
        if(conflict)break;
      }
      if(conflict)break;root=node;
    }
    return root;
  }
  function variableLabel(key){
    const words=key.replace(/^page\./,'').replace(/\.[a-f\d]{10}$/,'').split('.').map(part=>part.replace(/([a-z\d])([A-Z])/g,'$1 $2').toLowerCase()).join(' ').replace(/\bmember\b/,'user (this row)').replace(/\bviewed user\b/,'viewed user');
    return words.charAt(0).toUpperCase()+words.slice(1);
  }
  function resolveTemplate(template, element, original) {
    const values = new Map(listVariables(element).map(item=>[item.token,item]));
    return template.replace(variablePattern,(token,key)=>{
      if(key==='value')return original ?? '';
      const item=values.get(token);
      if(item)return item.available?item.value:'-';
      return /^(?:server|servers|nodes|node|user|users|member|viewedUser|images|image|folders|folder|panel|file|player|world|backup|console|page)\./.test(key)?'-':token;
    });
  }
  function resolveImage(template, element) {
    if(imageVariable.test(template))return resolveTemplate(template,element,'');
    const values=new Map(listVariables(element).map(item=>[item.token,item]));
    let missing=false;
    const resolved=template.replace(variablePattern,token=>{
      const item=values.get(token);
      if(!item?.available){missing=true;return '';}
      return encodeURIComponent(item.value);
    });
    return missing?null:resolved;
  }
  const protectedTags = new Set(['HTML','HEAD','BODY','SCRIPT','STYLE','LINK','META','IFRAME','OBJECT','EMBED','NOSCRIPT','TEMPLATE']);
  const textTags = new Set(['A','BUTTON','LABEL','SPAN','P','H1','H2','H3','H4','H5','H6','SUMMARY','LI','TD','TH','SMALL','STRONG','EM','LEGEND']);
  const svgTags = new Set(['svg','g','path','circle','rect','line','polyline','polygon','ellipse','defs','clipPath','mask','linearGradient','radialGradient','stop','title','desc']);
  const svgAttrs = new Set(['class','role','aria-hidden','aria-label','focusable','viewBox','width','height','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','d','points','fill','fill-rule','fill-opacity','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','stroke-opacity','opacity','transform','clip-path','clip-rule','mask','id','offset','stop-color','stop-opacity','gradientUnits','gradientTransform','spreadMethod','fx','fy','fr','clipPathUnits','maskUnits','maskContentUnits','preserveAspectRatio','vector-effect']);
  const iconAttrs = ['viewBox','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','preserveAspectRatio'];

  function sanitizeIcon(value) {
    if (typeof value !== 'string' || value.length > 100000 || !value.trim()) return null;
    try {
      const parsed = new win.DOMParser().parseFromString(value, 'image/svg+xml');
      if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg' || /<!DOCTYPE|<!ENTITY/i.test(value)) return null;
      const root = parsed.documentElement;
      for (const node of [root, ...root.querySelectorAll('*')]) {
        if (node.namespaceURI && node.namespaceURI !== 'http://www.w3.org/2000/svg' || !svgTags.has(node.localName)) return null;
        for (const attr of [...node.attributes]) {
          if (attr.name === 'xmlns') continue;
          if (!svgAttrs.has(attr.name) || /(?:javascript:|data:|https?:|\/\/|expression\s*\()/i.test(attr.value)) return null;
          if (/url\s*\(/i.test(attr.value) && !/^url\(#[A-Za-z_][\w:.-]*\)$/.test(attr.value.trim())) return null;
        }
      }
      root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      return new win.XMLSerializer().serializeToString(root);
    } catch { return null; }
  }
  function safeImageURL(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 3000000 || /[\u0000-\u001f]/.test(value)) return null;
    value = value.trim();
    if (imageVariable.test(value)) return value;
    if (/^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon);base64,[a-z0-9+/=\r\n]+$/i.test(value)) return value;
    if (/^data:image\/svg\+xml(?:;base64)?,/i.test(value)) {
      try {
        const comma = value.indexOf(','), raw = /;base64$/i.test(value.slice(0,comma)) ? win.atob(value.slice(comma+1)) : decodeURIComponent(value.slice(comma+1));
        const svg = sanitizeIcon(raw);return svg ? 'data:image/svg+xml,' + encodeURIComponent(svg) : null;
      } catch { return null; }
    }
    try { const url = new win.URL(value, doc.baseURI);return ['http:','https:'].includes(url.protocol) || url.protocol==='file:'&&!/^[a-z][a-z\d+.-]*:/i.test(value) ? value : null; } catch { return null; }
  }
  function normalizeManifest(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || input.version !== 1) throw Error('Unsupported theme customization format.');
    const result = empty();
    for (const appearance of ['light','dark']) {
      if (!Array.isArray(input[appearance]) || input[appearance].length > 500) throw Error('Each appearance supports up to 500 theme customizations.');
      for (const item of input[appearance]) {
        if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.selector !== 'string' || !item.selector.trim() || item.selector.length > 6000) throw Error('A theme customization needs a valid selector.');
        try { doc.querySelector(item.selector); } catch { throw Error('A theme customization contains an invalid selector.'); }
        const clean = { selector: item.selector };
        if(Object.hasOwn(item,'match')){
          if(!item.match||typeof item.match!=='object'||Array.isArray(item.match))throw Error('Invalid original content match.');
          clean.match={};for(const [kind,value]of Object.entries(item.match)){
            if(!['text','image','icon'].includes(kind)||typeof value!=='string'||value.length>3000000)throw Error('Invalid original content match.');
            clean.match[kind]=value;
          }
        }
        if (Object.hasOwn(item,'text')) { if (typeof item.text !== 'string' || item.text.length > 10000) throw Error('Theme text must be at most 10000 characters.');clean.text = item.text; }
        if (Object.hasOwn(item,'texts')) {
          if (!item.texts || typeof item.texts !== 'object' || Array.isArray(item.texts) || Object.keys(item.texts).length > 50) throw Error('Invalid translated theme texts.');
          clean.texts = {};
          for (const [language,text] of Object.entries(item.texts)) {
            if (!languagePattern.test(language) || typeof text !== 'string' || text.length > 10000) throw Error('Invalid translated theme texts.');
            clean.texts[language] = text;
          }
        }
        if (Object.hasOwn(item,'image')) { const image = safeImageURL(item.image);if (!image) throw Error('Choose a safe image URL or image file.');clean.image = image; }
        if (Object.hasOwn(item,'icon')) { const icon = sanitizeIcon(item.icon);if (!icon) throw Error('Choose a safe SVG icon.');clean.icon = icon; }
        if (Object.hasOwn(item,'remove')) { if (typeof item.remove !== 'boolean') throw Error('The removal setting must be true or false.');clean.remove = item.remove; }
        if (Object.keys(clean).length > 1) result[appearance].push(clean);
      }
    }
    return result;
  }
  function usable(element) { return element && element.nodeType === 1 && !protectedTags.has(element.tagName) && !element.closest('airlink-inspector-overlay'); }
  function textNodes(element) {
    if (!usable(element) || /^(?:INPUT|TEXTAREA|SELECT|SVG)$/.test(element.tagName)) return [];
    const own = [...element.childNodes].filter(node => node.nodeType === 3 && (node.nodeValue.trim() || records.get(element)?.texts.has(node)));
    if(own.length&&!element.children.length)return own;
    const inline=[...element.children].every(child=>['SPAN','STRONG','B','EM','I','SMALL','CODE','TIME','SVG'].includes(child.tagName));
    if (own.length&&!textTags.has(element.tagName)&&!inline) return own;
    if (!own.length&&!textTags.has(element.tagName)) return [];
    const walker = doc.createTreeWalker(element, win.NodeFilter.SHOW_TEXT), result = [];
    while (walker.nextNode()) {
      const node = walker.currentNode, parent = node.parentElement;
      if ((!node.nodeValue.trim()&&!records.get(element)?.texts.has(node)) || parent?.closest('script,style,svg,textarea,select,option,input,[data-theme-rich]')) continue;
      const control = parent?.closest('button,a,input,select,textarea');
      if (control && control !== element && element.contains(control)) continue;
      result.push(node);
    }
    return result;
  }
  function imageTarget(element) { if (!usable(element)) return null;if (element.tagName === 'IMG') return element;const direct = [...element.children].filter(node=>node.tagName==='IMG');return direct.length===1?direct[0]:null; }
  function iconTarget(element) { if (!usable(element)) return null;if (element.localName === 'svg') return element;const direct=[...element.children].filter(node=>node.localName==='svg');if(direct.length===1)return direct[0];if(['A','BUTTON','LABEL','SPAN','I'].includes(element.tagName)){const icons=element.querySelectorAll('svg');if(icons.length===1)return icons[0];}return null; }
  function originalAttribute(element,name){const value=element?.getAttribute(name),prior=records.get(element)?.attrs.get(name);return prior&&value===prior.expected?prior.original:value;}
  function translationKey(element){
    if(!element?.getAttribute)return null;const own=element.getAttribute('data-theme-i18n');if(own)return own;
    const nested=[...(element.querySelectorAll?.('[data-theme-i18n]')||[])];if(nested.length!==1)return null;
    const inside=textNodes(element).every(node=>nested[0].contains(node));return inside?nested[0].getAttribute('data-theme-i18n'):null;
  }
  function sourceContent(element){
    const nodes=textNodes(element),image=imageTarget(element),icon=iconTarget(element);
    const binding=textBinding(element),local=recordContext(element),i18n=binding?null:translationKey(element);
    const text=binding&&binding!=='{{value}}'?binding:element.tagName==='INPUT'&&element.hasAttribute('placeholder')?originalAttribute(element,'placeholder'):nodes.map(node=>{const prior=records.get(element)?.texts.get(node);return prior&&node.nodeValue===prior.expected?prior.original:node.nodeValue;}).map(value=>value.trim()).join(' ');
    const imageBinding=image?.getAttribute('data-theme-image');
    const iconRecord=records.get(icon)?.icon;
    const identity=local&&(local.values.path||local.values.id||local.values.name);
    if(i18n)return {text:'i18n:'+i18n,plainText:text,image:image?imageBinding&&imageBinding!=='{{image}}'?imageBinding:originalAttribute(image,'src'):null,icon:iconRecord&&sameChildren(icon,iconRecord.expected)?iconRecord.originalMarkup:icon?.outerHTML??null};
    return {text:binding&&local?binding+'@'+String(identity):text,image:image?imageBinding&&imageBinding!=='{{image}}'?imageBinding:originalAttribute(image,'src'):null,icon:iconRecord&&sameChildren(icon,iconRecord.expected)?iconRecord.originalMarkup:icon?.outerHTML??null};
  }
  function describe(element) {
    const nodes = textNodes(element), image = imageTarget(element), icon = iconTarget(element), placeholder = element?.tagName === 'INPUT' && element.hasAttribute('placeholder');
    const canText = usable(element) && (Boolean(consoleFor(element)) || Boolean(placeholder) || nodes.length > 0 || records.get(element)?.texts.size > 0 || textTags.has(element.tagName) && !element.children.length);
    const imageBound=image?.getAttribute('data-theme-image');
    const dynamicImage=Boolean(imageBound&&imageBound!=='{{image}}');
    let imageValue=image ? dynamicImage ? imageBound : originalAttribute(image,'src') || '{{image}}' : null;
    const textValue=canText ? textBinding(element) || (placeholder ? element.getAttribute('placeholder') : nodes.map(node=>node.nodeValue.trim()).join(' ')) : null;
    return { text: textValue, image: imageValue, icon: icon ? icon.outerHTML : null, source:sourceContent(element), canText: Boolean(canText), canImage: Boolean(image), canIcon: Boolean(icon), language: currentLanguage(), translationKey: canText && !textBinding(element) ? translationKey(element) : null };
  }
  function recordFor(element) { let record=records.get(element);if(!record){record={attrs:new Map(),styles:new Map(),texts:new Map(),icon:null};records.set(element,record);}return record; }
  function attribute(element,name,value) {
    const record=recordFor(element), current=element.getAttribute(name);let prior=record.attrs.get(name);
    if(!prior){prior={original:current,expected:value};record.attrs.set(name,prior);}else if(current!==prior.expected)prior.original=current;
    prior.expected=value;if(current===value)return;if(value===null)element.removeAttribute(name);else element.setAttribute(name,value);
  }
  function styleProperty(element,name,value,priority='') {
    const record=recordFor(element),current=element.style.getPropertyValue(name),currentPriority=element.style.getPropertyPriority(name);let prior=record.styles.get(name);
    if(!prior){prior={original:current,priority:currentPriority,expected:value,expectedPriority:priority};record.styles.set(name,prior);}else if(current!==prior.expected||currentPriority!==prior.expectedPriority){prior.original=current;prior.priority=currentPriority;}
    prior.expected=value;prior.expectedPriority=priority;if(current!==value||currentPriority!==priority)element.style.setProperty(name,value,priority);
  }
  const formatPattern=/\\\[|\[(\/?)(b|i|u|s|color|size|bg|font|style)(?:=([^\]\n]{0,300}))?\]/gi;
  const formatProperties=new Set(['color','background-color','font-size','font-weight','font-style','font-family','font-variant','text-decoration-line','text-decoration-color','text-decoration-style','text-decoration-thickness','text-transform','letter-spacing','opacity','padding','border-radius','text-shadow','vertical-align']);
  function formatStyles(tag,argument){
    const value=String(argument||'').trim();
    if(tag==='b')return {'font-weight':'700'};if(tag==='i')return {'font-style':'italic'};
    if(tag==='u')return {'text-decoration-line':'underline'};if(tag==='s')return {'text-decoration-line':'line-through'};
    if(tag==='color')return {color:value};if(tag==='size')return {'font-size':value};if(tag==='bg')return {'background-color':value};if(tag==='font')return {'font-family':value};
    const styles={};for(const part of value.split(';')){const index=part.indexOf(':');if(index>0)styles[part.slice(0,index).trim().toLowerCase()]=part.slice(index+1).trim();}return styles;
  }
  function safeFormatStyles(styles){
    const result={};
    for(const [name,value]of Object.entries(styles)){
      if(!formatProperties.has(name)||typeof value!=='string'||!value||value.length>200||/[;{}<>\\]|url\s*\(|expression|@import|javascript:/i.test(value))continue;
      try{if(win.CSS?.supports&&!win.CSS.supports(name,value))continue;}catch{continue;}
      result[name]=value;
    }
    return result;
  }
  function hasFormatting(template){return typeof template==='string'&&new RegExp(formatPattern.source,'i').test(template);}
  function parseFormatting(template){
    const parts=[],stack=[];let last=0;
    const add=text=>{if(!text)return;const styles=Object.assign({},...stack.map(item=>item.styles)),previous=parts.at(-1);if(previous&&JSON.stringify(previous.styles)===JSON.stringify(styles))previous.text+=text;else parts.push({text,styles});};
    for(const match of String(template).matchAll(new RegExp(formatPattern.source,'gi'))){
      add(template.slice(last,match.index));last=match.index+match[0].length;
      if(match[0]==='\\[') {add('[');continue;}
      const tag=match[2].toLowerCase();
      if(match[1]){const index=stack.map(item=>item.tag).lastIndexOf(tag);if(index<0)add(match[0]);else stack.splice(index,1);}
      else stack.push({tag,styles:safeFormatStyles(formatStyles(tag,match[3]))});
    }
    add(template.slice(last));return parts;
  }
  function plainText(template){return hasFormatting(template)?parseFormatting(template).map(part=>part.text).join(''):template;}
  function applyText(element,value) {
    const terminal=consoleFor(element);if(terminal){terminal.handled=true;terminal.overridden=true;renderConsole(terminal,resolveTemplate(plainText(value),element,terminal.output));return;}
    if(element.tagName==='INPUT'&&element.hasAttribute('placeholder')){const prior=records.get(element)?.attrs.get('placeholder'),current=element.getAttribute('placeholder');attribute(element,'placeholder',resolveTemplate(plainText(value),element,prior&&current===prior.expected?prior.original:current));return;}
    let nodes=textNodes(element);if(!nodes.length&&textTags.has(element.tagName)&&!element.children.length){const node=doc.createTextNode('');element.append(node);recordFor(element).texts.set(node,{original:'',expected:'',created:true});nodes=[node];}
    const record=recordFor(element);
    const live=nodes.map(node=>{const prior=record.texts.get(node);return prior&&node.nodeValue===prior.expected?prior.original:node.nodeValue;}).join('');
    const formatted=hasFormatting(value)&&nodes.length>0;
    const parts=formatted?parseFormatting(value).map(part=>({text:resolveTemplate(part.text,element,live.trim()),styles:part.styles})):null;
    value=formatted?'':resolveTemplate(value,element,live.trim());
    nodes.forEach((node,index)=>{const desired=index===0?value:'',current=node.nodeValue;let prior=record.texts.get(node);if(!prior){prior={original:current,expected:desired,created:false};record.texts.set(node,prior);}else if(current!==prior.expected)prior.original=current;prior.expected=desired;if(current!==desired)node.nodeValue=desired;});
    if(!formatted){if(record.rich){record.rich.node.remove();record.rich=null;}return;}
    let rich=record.rich?.node;if(!rich){rich=doc.createElement('span');rich.setAttribute('data-theme-rich','');}
    if(rich.previousSibling!==nodes[0])nodes[0].after(rich);
    const signature=JSON.stringify(parts);
    if(record.rich?.signature!==signature){
      rich.replaceChildren(...parts.map(part=>{if(!Object.keys(part.styles).length)return doc.createTextNode(part.text);const span=doc.createElement('span');for(const [name,style]of Object.entries(part.styles))span.style.setProperty(name,style);span.textContent=part.text;return span;}));
    }
    record.rich={node:rich,signature};
  }
  function sameChildren(element,nodes) { return nodes.length===element.childNodes.length&&nodes.every((node,index)=>element.childNodes[index]===node); }
  function applyIcon(element,value) {
    const target=iconTarget(element);if(!target)return;const record=recordFor(target);
    if(record.icon?.value===value&&sameChildren(target,record.icon.expected))return;
    if(!record.icon||!sameChildren(target,record.icon.expected))record.icon={original:[...target.childNodes],originalMarkup:target.outerHTML,expected:[],value:''};
    const parsed=new win.DOMParser().parseFromString(value,'image/svg+xml').documentElement;
    target.replaceChildren(...[...parsed.childNodes].map(node=>doc.importNode(node,true)));record.icon.expected=[...target.childNodes];record.icon.value=value;
    for(const name of iconAttrs)attribute(target,name,parsed.getAttribute(name));
  }
  function restoreAll() {
    for(const state of consoles.values())if(state.overridden){renderConsole(state,state.output);state.overridden=false;}
    for(const [element,record]of records){
      if(!element.isConnected)continue;
      record.rich?.node.remove();
      for(const [node,prior]of record.texts)if(node.isConnected&&node.nodeValue===prior.expected){if(prior.created)node.remove();else node.nodeValue=prior.original;}
      if(record.icon&&sameChildren(element,record.icon.expected))element.replaceChildren(...record.icon.original);
      for(const [name,prior]of record.attrs)if(element.getAttribute(name)===prior.expected){if(prior.original===null)element.removeAttribute(name);else element.setAttribute(name,prior.original);}
      for(const [name,prior]of record.styles)if(element.style.getPropertyValue(name)===prior.expected&&element.style.getPropertyPriority(name)===prior.expectedPriority){if(prior.original)element.style.setProperty(name,prior.original,prior.priority);else element.style.removeProperty(name);}
    }
    records.clear();
  }
  const observer=new win.MutationObserver(mutations=>{
    const next=doc.documentElement.classList.contains('dark')?'dark':'light';if(next!==mode){setMode(next);return;}
    if(manifest[mode].length&&mutations?.some(change=>(change.target.nodeType===1?change.target:change.target.parentElement)?.closest?.('[data-theme-live]'))){applyCurrent();return;}
    if(manifest[mode].length&&!timer)timer=win.setTimeout(()=>{timer=0;applyCurrent();},80);
  });
  function observe() {
    if(!doc.body)return;observer.observe(doc.documentElement,{attributes:true,attributeFilter:['class']});observer.observe(doc.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','src','srcset','placeholder','data-theme-fields','hidden','style']});observing=true;
  }
  function applyCurrent() {
    observer.disconnect();observing=false;itemRoots=new WeakMap();
    try {
      for(const [element,record]of records){if(!element.isConnected)records.delete(element);else for(const [node]of record.texts)if(!node.isConnected)record.texts.delete(node);}
      for(const rule of manifest[mode]){
        const elements=[...doc.querySelectorAll(rule.selector)].slice(0,2000);
        for(const element of elements){
          if(!usable(element))continue;
          const source=rule.match?sourceContent(element):null;
          const matchesContent=kind=>!rule.match||!Object.hasOwn(rule.match,kind)||rule.match[kind]===source[kind]||kind==='text'&&source.plainText!==undefined&&rule.match.text===source.plainText;
          if((Object.hasOwn(rule,'text')||rule.texts)&&matchesContent('text')){const text=ruleText(rule);if(typeof text==='string')applyText(element,text);}
          if(rule.image&&matchesContent('image')){const target=imageTarget(element);if(target&&rule.image!=='{{image}}'){
            const resolved=resolveImage(rule.image,element),image=safeImageURL(resolved);
            if(image&&!imageVariable.test(image)&&resolved!=='-'){attribute(target,'src',image);attribute(target,'srcset',null);if(target.parentElement?.tagName==='PICTURE')for(const source of target.parentElement.querySelectorAll('source'))attribute(source,'srcset',null);}
            else {for(const name of ['src','srcset']){const prior=records.get(target)?.attrs.get(name);if(prior){attribute(target,name,prior.original);records.get(target).attrs.delete(name);}}}
          }}
          if(rule.icon&&matchesContent('icon'))applyIcon(element,rule.icon);
          if(rule.remove){attribute(element,'hidden','');attribute(element,'aria-hidden','true');styleProperty(element,'display','none','important');}
        }
      }
    } finally { observe(); }
  }
  function setMode(value) { const next=value==='light'?'light':'dark';if(next===mode)return true;observer.disconnect();restoreAll();mode=next;applyCurrent();return true; }
  function setManifest(value) {
    const raw=JSON.stringify(value);if(raw===signature){manual=true;return true;}
    const next=normalizeManifest(value);manual=true;loading++;observer.disconnect();restoreAll();manifest=next;signature=raw;applyCurrent();return true;
  }
  async function loadSheet(appearance) {
    const href=doc.getElementById(appearance+'-theme-css')?.getAttribute('href');if(!href)return null;
    let url;try{url=new win.URL(href,doc.baseURI);}catch{return null;}
    if(url.origin!==win.location.origin||!/^\/themes\/user\/[^/]+\/(?:light|dark)\.css$/.test(url.pathname))return null;
    const metadataURL=new win.URL('info.json',url).href;
    if(!fetched.has(metadataURL))fetched.set(metadataURL,(async()=>{
      try {
        const metadataResponse=await win.fetch(metadataURL,{credentials:'same-origin'});if(!metadataResponse.ok)return null;const info=await metadataResponse.json();
        if(info?.customizations!=='customizations.json')return null;
        const response=await win.fetch(new win.URL('customizations.json',metadataURL).href,{credentials:'same-origin'});if(!response.ok)return null;
        if(Number(response.headers.get('content-length'))>6000000)return null;const text=await response.text();if(text.length>6000000)return null;return normalizeManifest(JSON.parse(text));
      }catch{return null;}
    })());
    return fetched.get(metadataURL);
  }
  async function autoLoad() {
    try { if(win.parent!==win&&win.parent.AirlinkDemo)return false; }catch{}
    if(manual)return false;const current=++loading;
    const [light,dark]=await Promise.all([loadSheet('light'),loadSheet('dark')]);if(current!==loading||manual)return false;
    observer.disconnect();restoreAll();manifest={version:1,light:light?.light||[],dark:dark?.dark||[]};signature=JSON.stringify(manifest);mode=doc.documentElement.classList.contains('dark')?'dark':'light';applyCurrent();return true;
  }
  const api={document:doc,exportState:()=>({manifest:manual?manifest:null,signature:manual?signature:'',mode}),dispose:()=>{observer.disconnect();win.clearTimeout?.(timer);},setManifest,setMode,describe,autoLoad,normalizeManifest,sanitizeIcon,safeImageURL,listVariables,registerConsole,refresh:applyCurrent,clear:()=>setManifest(empty())};
  if(inherited?.manifest){manifest=inherited.manifest;signature=inherited.signature;manual=true;mode=doc.documentElement.classList.contains('dark')?'dark':'light';}
  win.AirlinkThemeCustomizations=api;
  if(inherited?.manifest){if(doc.body)applyCurrent();else doc.addEventListener('DOMContentLoaded',()=>applyCurrent(),{once:true});}
  if(doc.body)observe();else doc.addEventListener('DOMContentLoaded',observe,{once:true});return api;
}
if(typeof window!=='undefined'){
  const airlinkThemeCustomizations=installThemeCustomizations(window);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>airlinkThemeCustomizations.autoLoad(),{once:true});
  else airlinkThemeCustomizations.autoLoad();
}
