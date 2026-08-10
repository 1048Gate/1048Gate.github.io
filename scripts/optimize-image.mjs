import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync} from 'node:fs';
import {dirname, extname, resolve} from 'node:path';

const [inputArg, outputArg, maxArg = '256'] = process.argv.slice(2);

if(!inputArg || !outputArg){
  console.error('Usage: npm run optimize:image -- <source> <output.webp> [max-pixels]');
  process.exit(1);
}

const input = resolve(inputArg);
const output = resolve(outputArg);
const maxPixels = Number(maxArg);

if(!existsSync(input)) throw new Error(`Source image does not exist: ${input}`);
if(extname(output).toLowerCase() !== '.webp') throw new Error('Output filename must end in .webp.');
if(!Number.isInteger(maxPixels) || maxPixels < 64 || maxPixels > 2048){
  throw new Error('Maximum dimension must be a whole number from 64 through 2048.');
}

let command = 'magick';
try{
  execFileSync(command, ['-version'], {stdio:'ignore'});
}catch{
  command = 'convert';
  try{
    execFileSync(command, ['-version'], {stdio:'ignore'});
  }catch{
    throw new Error('ImageMagick is required. Install it, then run this command again.');
  }
}

mkdirSync(dirname(output), {recursive:true});
execFileSync(command, [
  input,
  '-auto-orient',
  '-resize', `${maxPixels}x${maxPixels}>`,
  '-strip',
  '-quality', '82',
  '-define', 'webp:method=6',
  output
], {stdio:'inherit'});

console.log(`Optimized ${inputArg} -> ${outputArg} (max ${maxPixels}px)`);
