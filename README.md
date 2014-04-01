CanvasCrop
===========

A `<canvas>`-based image cropping jQuery plugin.

This plugin is based on Simon Sarris's tutorial and code found at http://simonsarris.com/blog/510-making-html5-canvas-useful.

Usage
-----------

```javascript
$(function() {
  var canvas = $('#my-canvas');

  canvas.canvasCrop({
    marqueeType: 'ellipse',
    constrain: true,
    src: 'path/to/my/image.png'
  });

  canvas.on('crop.finish', function(e, coords) {
    console.log('mouse released', coords);
  });

  canvas.on('crop.resize', function(e, coords) {
    console.log('drawing marquee', coords);
  });

  canvas.on('crop.reposition', function(e, coords) {
    console.log('moving marquee', coords);
  });
});
```
