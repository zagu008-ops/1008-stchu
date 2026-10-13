import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../index.js',import.meta.url),'utf8');
const start=source.indexOf('      if (modelSelect2) {\n        settings2.MODEL_NAME');
const block=source.slice(start,source.indexOf('      if (vaeSelect)',start));
class Option{constructor(label,value){this.label=label;this.value=value;}}
const select={options:[{value:'sd15'}],selectedIndex:-1,_value:'',set value(v){this._value=v;this.selectedIndex=this.options.findIndex(o=>o.value===v);},get value(){return this._value;},add(o){this.options.push(o)}};
const settings={MODEL_NAME:'anima'};
new Function('modelSelect2','settings2','normalizeBackslashPath3','Option',block)(select,settings,x=>x,Option);
assert.equal(settings.MODEL_NAME,'anima');assert.equal(select.value,'anima');assert.equal(select.options.length,2);
