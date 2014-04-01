CropCanvas
===========

A `<canvas>`-based image cropping jQuery plugin.

Usage
-----------

```javascript
$(function() {
  var canvas = $('#my-canvas');
  canvas.cropCanvas({
    marqueeType: 'ellipse',
    constrain: true,
    src: 'path/to/my/image.png'
  });
});
```
