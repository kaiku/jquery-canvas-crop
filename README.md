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
    src: 'path/to/my/image.png',
    enableRawDataOutput: true
  });

  canvas.on('crop.finish', function(e) {
    console.log('mouse released', e.coordinates);
  });

  canvas.on('crop.resize', function(e) {
    console.log('drawing marquee', e.coordinates);
  });

  canvas.on('crop.reposition', function(e) {
    console.log('moving marquee', e.coordinates);
  });

  canvas.on('crop.data', function(e) {
    var img = $('<img>').attr('src', e.rawData.data);
    img.on('load', function() {
      $('body').append(img);
    });
    console.log(e.rawData.x, e.rawData.y, e.rawData.w, e.rawData.h);
  });
});
```

You can also select the entire canvas – or a centered portion of it, if the marquee is constrained – using the API:

```javascript
canvas.trigger('crop.api.selectall');
```
