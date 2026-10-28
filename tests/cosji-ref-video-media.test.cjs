const fs = require('node:fs');
const assert = require('node:assert/strict');
const text = fs.readFileSync('./index.js', 'utf8');
const start = text.indexOf('function buildComfyUIRefVideoWorkflow(');
const end = text.indexOf('\nasync function generateComfyUIRefVideo(', start);
assert(start >= 0 && end > start, 'Reference video builder must exist');
const build = new Function(text.slice(start, end) + '; return buildComfyUIRefVideoWorkflow;')();

const template = JSON.stringify({
  image1: {class_type: 'LoadImage', inputs: {image: '%图片1%'}},
  image2: {class_type: 'LoadImage', inputs: {image: '%图片2%'}},
  audio1: {class_type: 'LoadAudio', inputs: {audio: '%音频1%'}},
  audio2: {class_type: 'LoadAudio', inputs: {audio: '%音频2%'}},
  activeImage: {class_type: 'LoadImage', inputs: {image: 'background.png'}},
  video: {class_type: 'ReferenceVideo', inputs: {
    first_frame: ['image1', 0], reference_image: ['image2', 0],
    audio: ['audio1', 0], extra_audio: ['audio2', 0],
    background: ['activeImage', 0], prompt: '%prompt%', seed: '%seed%'
  }}
});
const settings = {seed: '1234'};
const result = build(template, 'A train at dusk.', {1: 'frame.png'}, {1: 'voice.wav'}, settings);
assert.equal(result.seedUsed, 1234);
assert.equal(result.promptObj.image1.inputs.image, 'frame.png');
assert.equal(result.promptObj.audio1.inputs.audio, 'voice.wav');
assert.deepEqual(result.promptObj.video.inputs.first_frame, ['image1', 0]);
assert.deepEqual(result.promptObj.video.inputs.audio, ['audio1', 0]);
assert.equal(result.promptObj.image2, undefined);
assert.equal(result.promptObj.audio2, undefined);
assert.equal(result.promptObj.video.inputs.reference_image, undefined);
assert.equal(result.promptObj.video.inputs.extra_audio, undefined);
assert.deepEqual(result.promptObj.video.inputs.background, ['activeImage', 0]);
assert.equal(result.promptObj.video.inputs.prompt, 'A train at dusk.');

const empty = build(template, 'A train at dusk.', {}, {}, settings).promptObj;
for (const id of ['image1', 'image2', 'audio1', 'audio2']) assert.equal(empty[id], undefined);
assert.equal(empty.activeImage.inputs.image, 'background.png');
assert.deepEqual(empty.video.inputs, {background: ['activeImage', 0], prompt: 'A train at dusk.', seed: 1234});
console.log('PASS: optional reference media do not submit empty loaders or dangling links; active media are retained');
