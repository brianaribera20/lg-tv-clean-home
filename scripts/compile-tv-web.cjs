// Compile classic webOS scripts separately: bundling their UMD wrappers would
// change their globals. A single ES5 core-js bundle runs before all app scripts.
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const acorn = require('acorn');
const postcss = require('postcss');
const presetEnv = require('postcss-preset-env');
const doiuse = require('doiuse');
const html = require('parse5');
// Local per-TV build options (update-home.sh sets them for this TV):
//   TV_BROWSERS   override the browserslist targets, e.g. "Chrome 87" for webOS 22
//   TV_NO_POLYFILLS=1  skip the 270 KB core-js bundle, which a modern engine never needs
//   TV_LANG_ONLY  keep one language in catalogs.js, e.g. "en"
//   TV_FAST_BOOT=1  let Home skip updater services it has already found missing on this TV
//   (TV_APP_TITLE, the title on Home's "Loading..." card, is applied in tv_web_build.py)
//   TV_BUNDLE=1   join index.html's scripts and stylesheets into one file each: every
//                 separate file read from the TV's flash storage delays the first frame
const targets = process.env.TV_BROWSERS ? process.env.TV_BROWSERS.split(',') : require('../package.json').browserslist;
const noPolyfills = process.env.TV_NO_POLYFILLS === '1';
const root = path.resolve(__dirname, '..');
const polyfillsName = 'compat-polyfills.js';

function javascript(code, filename) {
  // Already-compatible scripts keep their bytes and global-script semantics.
  try { acorn.parse(code, {ecmaVersion: 5}); return code; } catch (_) {}
  const output = babel.transformSync(code, {
    filename, cwd: root, configFile: false, babelrc: false, sourceType: 'script',
    presets: [[require.resolve('@babel/preset-env'), {
      targets, forceAllTransforms: true, modules: false, useBuiltIns: false, bugfixes: true
    }]]
  }).code;
  acorn.parse(output, {ecmaVersion: 5});
  return output + '\n';
}

async function stylesheet(code, filename) {
  const transformed = await postcss([presetEnv({browsers: targets, stage: 3, preserve: false,
    features: {'logical-properties-and-values': true, 'hexadecimal-alpha-notation': true}})]).process(code, {from: filename, map: false});
  const unsupported = [];
  transformed.root.walkDecls(/^(overflow-wrap|word-wrap)$/, declaration => {
    if (declaration.value === 'anywhere') unsupported.push(filename + ': ' + declaration.prop + ': anywhere requires a legacy break-word value');
  });
  await postcss([doiuse({browsers: targets, onFeatureUsage: usage => {
    // doiuse groups legacy overflow values with newer clip/overlay features.
    // Only the four original values are accepted, not the entire feature family.
    if (usage.feature === 'css-overflow' && /^overflow(?:-[xy])?$/.test(usage.usage.prop) &&
        /^(auto|hidden|scroll|visible)$/.test(usage.usage.value)) return;
    unsupported.push(usage.message);
  }})])
    .process(transformed.css, {from: filename, map: false});
  if (unsupported.length) throw Error(filename + ': unsupported CSS after PostCSS:\n' + unsupported.join('\n'));
  return transformed.css;
}

async function document(code, filename) {
  const tree = html.parse(code);
  let head, hasPolyfills = false;
  async function visit(node) {
    if (node.tagName === 'head') head = node;
    const attrs = node.attrs || [];
    const source = attrs.find(attr => attr.name === 'src');
    if (node.tagName === 'script' && source && source.value === polyfillsName) hasPolyfills = true;
    if (node.tagName === 'style') {
      for (const text of node.childNodes) text.value = await stylesheet(text.value, filename + '.style.css');
    }
    for (const attr of attrs) {
      if (attr.name === 'style') {
        const css = await stylesheet('.inline{' + attr.value + '}', filename + '.attribute.css');
        attr.value = postcss.parse(css).first.nodes.map(node => node.toString()).join(';');
      }
    }
    if (node.tagName === 'script' && !source) {
      const type = attrs.find(attr => attr.name === 'type');
      if (type && type.value === 'module') throw Error(filename + ': use classic scripts, not unbundled ES modules');
      if (!type || /^(text|application)\/javascript$/.test(type.value)) {
        for (const text of node.childNodes) text.value = javascript(text.value, filename + '.inline.js');
      }
    }
    for (const child of node.childNodes || []) await visit(child);
    if (node.content) await visit(node.content);
  }
  await visit(tree);
  if (!hasPolyfills && !noPolyfills) {
    const script = html.parseFragment('<script src="' + polyfillsName + '"></script>').childNodes[0];
    script.parentNode = head;
    head.childNodes.unshift(script);
  }
  return html.serialize(tree);
}

function onlyLanguage(code, lang) {
  // catalogs.js is a series of HomeI18n.add({...}) calls; collect them and keep one language.
  const merged = {};
  require('node:vm').runInNewContext(code, {HomeI18n: {add(values) { Object.assign(merged, values[lang] || {}); }}});
  return 'HomeI18n.add(' + JSON.stringify({[lang]: merged}) + ');\n';
}

async function compile(files) {
  const output = {...files};
  for (let [name, code] of Object.entries(files)) {
    if (name === polyfillsName) continue;
    if (name === 'catalogs.js' && process.env.TV_LANG_ONLY) code = onlyLanguage(code, process.env.TV_LANG_ONLY);
    if (name === 'profile-bootstrap.js' && process.env.TV_FAST_BOOT === '1') code = 'window.TV_FAST_BOOT=true;\n' + code;
    if (name.endsWith('.js')) output[name] = javascript(code, name);
    if (name.endsWith('.css')) output[name] = await stylesheet(code, name);
    if (name.endsWith('.html')) output[name] = await document(code, name);
  }
  if (!noPolyfills && Object.keys(files).some(name => name.endsWith('.html'))) {
    output[polyfillsName] = fs.readFileSync(require.resolve('core-js-bundle/minified.js'), 'utf8');
    acorn.parse(output[polyfillsName], {ecmaVersion: 5});
    output['compat-LICENSE.txt'] = fs.readFileSync(require.resolve('core-js-bundle/LICENSE'), 'utf8') + '\n' +
      fs.readFileSync(path.join(path.dirname(require.resolve('@babel/core/package.json')), 'LICENSE'), 'utf8');
  }
  if (process.env.TV_BUNDLE === '1' && output['index.html']) bundle(output);
  return output;
}

function bundle(output) {
  let page = output['index.html'];
  const scripts = [...page.matchAll(/<script src="([^"]+)"><\/script>\s*/g)].filter(m => output[m[1]] !== undefined);
  const styles = [...page.matchAll(/<link rel="stylesheet" href="([^"]+)">\s*/g)].filter(m => output[m[1]] !== undefined);
  // Classic scripts share globals, so joining them in order keeps their behaviour.
  output['home-bundle.js'] = scripts.map(m => output[m[1]] + '\n;').join('\n');
  output['home-bundle.css'] = styles.map(m => output[m[1]]).join('\n');
  scripts.forEach((m, i) => { page = page.replace(m[0], i === scripts.length - 1 ? '<script src="home-bundle.js"></script>\n' : ''); });
  styles.forEach((m, i) => { page = page.replace(m[0], i === styles.length - 1 ? '<link rel="stylesheet" href="home-bundle.css">\n' : ''); });
  output['index.html'] = page;
}

exports.compile = compile;
if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => input += chunk);
  process.stdin.on('end', () => compile(JSON.parse(input)).then(output => process.stdout.write(JSON.stringify(output)))
    .catch(error => {console.error(error.message); process.exitCode = 1;}));
}
