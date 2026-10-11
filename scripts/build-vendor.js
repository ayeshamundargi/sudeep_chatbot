import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

fs.mkdirSync('./public/vendor', { recursive: true });

// Copy marked and DOMPurify
fs.copyFileSync('./node_modules/marked/lib/marked.esm.js', './public/vendor/marked.esm.js');
fs.copyFileSync('./node_modules/dompurify/dist/purify.min.js', './public/vendor/purify.min.js');

// Bundle highlight.js for clean browser usage
await esbuild.build({
  entryPoints: ['./node_modules/highlight.js/lib/index.js'],
  bundle: true,
  minify: true,
  format: 'esm',
  outfile: './public/vendor/hljs.esm.js',
});

console.log('Vendor bundles built successfully in public/vendor');
