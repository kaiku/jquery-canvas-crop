/**
 * CanvasCrop is a jQuery plugin that uses <canvas> to allow basic image cropping.
 * Thanks to Simon Sarris for inspiration/code: http://simonsarris.com/blog/510-making-html5-canvas-useful
 *
 * @author Greg Kuwaye
 * @license MIT License - http://www.opensource.org/licenses/mit-license.php
 */

// Object.create polyfill
if (typeof Object.create !== 'function') {
  Object.create = function (o) {
    function F() {}
    F.prototype = o;
    return new F();
  };
}

(function (factory) {
  if (typeof define === 'function' && define.amd) {
    define(['jquery'], factory);
  } else {
    factory(jQuery);
  }
}(function($) {
  'use strict';

  var CanvasCrop,
      Shape,
      Rectangle,
      Ellipse;

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} options
   * @constructor
   */
  CanvasCrop = function (canvas, options) {
    var computedStyle = window.getComputedStyle(canvas, null);

    this.$canvas = $(canvas);
    this.$window = $(window);
    this.options = $.extend({}, CanvasCrop.DEFAULTS, options);
    this.context = canvas.getContext('2d');
    this.image = null;
    this.marquee = this.options.marqueeType === 'ellipse' ? new Ellipse() : new Rectangle();

    this.state = {
      canvas: {
        paddingLeft: parseInt(computedStyle.getPropertyValue('padding-left')),
        paddingTop: parseInt(computedStyle.getPropertyValue('padding-top')),
        borderTop: parseInt(computedStyle.getPropertyValue('border-top-width')),
        borderLeft: parseInt(computedStyle.getPropertyValue('border-left-width'))
      },
      repositioning: false,
      repositioningCoords: {
        x: null,
        y: null
      },
      repositioningOffset: {
        x: null,
        y: null
      },
      resizing: false,
      resizingCoords: {
        x: null,
        y: null
      },
      shiftKey: false
    };

    this.init();
  };

  /**
   * marqueeType: "rectangle" or "ellipse"
   * constrain:   Constrain marquee ratio to 1:1 (square/circle)
   * src:         The path to the image
   *
   * @type {{marqueeType: string, constrain: boolean, src: string}}
   */
  CanvasCrop.DEFAULTS = {
    marqueeType: 'rectangle', // rectangle, ellipse
    constrain: true,
    src: '',
    enableRawDataOutput: false
  };

  /**
   * Bootstraps the process.
   */
  CanvasCrop.prototype.init = function () {
    var self = this;

    this.$canvas
        .on('mousedown', $.proxy(this.handleMousedown, this))
        .on('mousemove', $.proxy(this.handleMousemove, this))
        .css('cursor', 'crosshair');

    this.$window
        .on('mouseup', $.proxy(this.handleMouseup, this))
        .on('keyup keydown', function(e) {
          self.state.shiftKey = e.shiftKey;
          return true;
        });

    this.drawBackground();
  };

  /**
   * @param {object} e
   */
  CanvasCrop.prototype.handleMousedown = function (e) {
    var mouse = this.getMouse(e),
        state = this.state,
        marquee = this.marquee;

    // Mouse was pressed while inside a visible marquee.
    if (marquee && marquee.contains(mouse.x, mouse.y)) {
      state.repositioning = true;
      state.resizing = false;
      state.repositioningOffset.x = mouse.x - marquee.x;
      state.repositioningOffset.y = mouse.y - marquee.y;
    } else {
      state.repositioning = false;
      state.resizing = true;
    }
  };

  /**
   * @param {object} e
   */
  CanvasCrop.prototype.handleMouseup = function (e) {
    var coords;

    // If we were just repositioning or resizing a box, report the final crop size.
    if (this.state.repositioning || this.state.resizing) {
      coords = this.getCropCoordinates(true);

      if (coords.x && coords.y && coords.w && coords.h) {
        this.$canvas.trigger($.Event('crop.finish', {coordinates: coords}));

        // Have we enabled raw data output?
        if (this.options.enableRawDataOutput) {
          this.$canvas.trigger($.Event('crop.data', {rawData: this.getRawCroppedImageData()}));
        }
      }
    }

    this.state.repositioning = false;
    this.state.resizing = false;
  };

  /**
   * @param {object} e
   */
  CanvasCrop.prototype.handleMousemove = function (e) {
    var state = this.state,
        mouse = this.getMouse(e),
        marquee = this.marquee;

    if (marquee) {
      if (marquee.contains(mouse.x, mouse.y)) {
        this.$canvas.css('cursor', 'move');
      } else {
        this.$canvas.css('cursor', 'crosshair');
      }
    }

    // Nothing to do, so reset some values.
    if (!state.repositioning && !state.resizing) {
      state.resizingCoords.x = null;
      state.resizingCoords.y = null;
      return;
    }

    this.clearCanvas();

    if (state.repositioning) {
      this.repositionMarquee(e);
    } else if (state.resizing) {
      this.resizeMarquee(e);
    }
  };

  /**
   * Fires each time a marquee is repositioned by dragging.
   *
   * @param {object} e
   */
  CanvasCrop.prototype.repositionMarquee = function (e) {
    var mouse = this.getMouse(e),
        state = this.state,
        dimensions = this.getScaledDimensions(),
        marquee = this.marquee,
        x, y;

    // The marquee begins at the cursor minus the initial click offset.
    x = mouse.x - state.repositioningOffset.x;
    y = mouse.y - state.repositioningOffset.y;

    // Ensure that the marquee cannot move beyond the image dimension bounds;
    x = Math.min(Math.max(x, dimensions.x), dimensions.x2 - marquee.w);
    y = Math.min(Math.max(y, dimensions.y), dimensions.y2 - marquee.h);

    this.draw(x, y, marquee.w, marquee.h);
    this.$canvas.trigger($.Event('crop.reposition', {coordinates: this.getCropCoordinates(true)}));
  };

  /**
   * Fires each time a marquee is redrawn (resized).
   *
   * @param {object} e
   */
  CanvasCrop.prototype.resizeMarquee = function (e) {
    var mouse = this.getMouse(e),
        state = this.state,
        dimensions = this.getScaledDimensions(),
        x, y, w, h;

    // Save these values that are used to calculate offets during resizing and dragging.
    if (!state.resizingCoords.x || !state.resizingCoords.y) {
      state.resizingCoords = mouse;
      state.repositioningCoords = mouse;
    }

    // Ensure that the marquee cannot start outside of the scaled image area and
    // cannot be dragged outside of the scaled image area.

    x = Math.min(Math.max(state.resizingCoords.x, dimensions.x), dimensions.x2);
    y = Math.min(Math.max(state.resizingCoords.y, dimensions.y), dimensions.y2);

    if (mouse.x < x) {
      w = Math.max(mouse.x - x, dimensions.x - x);
    } else {
      w = Math.min(Math.max(mouse.x - x, 0), dimensions.x2 - x);
    }

    if (mouse.y < y) {
      h = Math.max(mouse.y - y, dimensions.y - y);
    } else {
      h = Math.min(Math.max(mouse.y - y, 0), dimensions.y2 - y);
    }

    // Constrain aspect ratio if shift key is pressed or we're constraining.
    if (this.options.constrain || this.state.shiftKey) {
      var min = Math.min(Math.abs(w), Math.abs(h));
      h = h < 0 ? -min : min;
      w = w < 0 ? -min : min;
    }

    this.draw(x, y, w, h);
    this.$canvas.trigger($.Event('crop.resize', {coordinates: this.getCropCoordinates(true)}));
  };

  /**
   * Draws the canvas from the bottom up, starting with the base background image; next, the semi-transparent overlay;
   * and finally, the clipping mask image representing the selceted area.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   */
  CanvasCrop.prototype.draw = function (x, y, w, h) {
    var context = this.context,
        dimensions = this.getScaledDimensions();

    this.clearCanvas();
    this.drawBackground();

    // The semi-transparent overlay.
    context.fillStyle = 'rgba(0, 0, 0, .5)';
    context.fillRect(dimensions.x, dimensions.y, dimensions.w, dimensions.h);
    context.save();

    // Tell the marquee to draw itself on the context.
    this.marquee.update(x, y, w, h);
    this.marquee.draw(context);

    // Clip the just-drawn marquee and draw the background on top of it.
    context.clip();
    this.drawBackground();

    // Restore the context, giving the impression of a "windowed" selection.
    context.restore();
  };

  /**
   * Gets the scaled cropped coordinates of the image from the marquee. Optionally return Math.floor'ed values.
   *
   * @returns {{x: number, y: number, w: number, h: number}}
   */
  CanvasCrop.prototype.getCropCoordinates = function(floor) {
    var factor = this.getScalingFactor(),
        marquee = this.marquee,
        dimensions,
        packed;

    if (!marquee) return null;

    // The image will be centered in the canvas, so take the x and y offset into account.
    dimensions = this.getScaledDimensions();

    // The x/y offset will be >= 0.
    packed = {
      x: (marquee.x - dimensions.x) / factor,
      y: (marquee.y - dimensions.y) / factor,
      w: marquee.w / factor,
      h: marquee.h / factor
    };

    // Normalize the values.
    if (floor) {
      for (var i in packed) {
        if (packed.hasOwnProperty(i)) {
          packed[i] = Math.floor(packed[i]);
        }
      }
    }

    return packed;
  };

  /**
   * Loads the image and draws it.
   */
  CanvasCrop.prototype.drawBackground = function() {
    var self = this,
        drawImage;

    drawImage = function () {
      var dimensions = self.getScaledDimensions();
      self.context.drawImage(self.image, dimensions.x, dimensions.y, dimensions.w, dimensions.h);
    };

    if (this.options.src && !this.image) {
      this.image = document.createElement('img');
      this.image.src = this.options.src;
      $(this.image).on('load', drawImage);
    } else {
      drawImage();
    }
  };

  /**
   * Clears the entire canvas.
   */
  CanvasCrop.prototype.clearCanvas = function () {
    this.context.clearRect(0, 0, this.getCanvasWidth(), this.getCanvasHeight());
  };

  /**
   * Returns the coordinates used to fit an image into the canvas. Centers and scales down if necessary.
   *
   * @returns {{x: number, y: number, x2: number, y2: number, w: number, h: number}}
   */
  CanvasCrop.prototype.getScaledDimensions = function() {
    var factor = this.getScalingFactor(),
        w = this.image.width * factor,
        h = this.image.height * factor,
        x = (this.getCanvasWidth() - w) / 2,
        y = (this.getCanvasHeight() - h) / 2;

    return {
      x: x,
      y: y,
      x2: x + w,
      y2: y + h,
      w: w,
      h: h
    };
  };

  /**
   * Returns the image scaling factor that is not greater than 1x.
   *
   * @returns {number}
   */
  CanvasCrop.prototype.getScalingFactor = function() {
    var xScale = this.getCanvasWidth() / this.image.width,
        yScale = this.getCanvasHeight() / this.image.height;

    return Math.min(Math.min(xScale, yScale), 1);
  };

  CanvasCrop.prototype.getCanvasWidth = function() {
    return this.$canvas[0].width;
  };

  CanvasCrop.prototype.getCanvasHeight = function() {
    return this.$canvas[0].height;
  };

  /**
   * Gets the mouse coordinates relative to the canvas. The event properties pageX and pageY give us the position
   * of the mouse relative to the left and top edge of the document. We then subtract the canvas offset relative
   * to the same corner as well as padding and border to get the "true" coordinates relative to the canvas.
   */
  CanvasCrop.prototype.getMouse = function(e) {
    var tgt = e.target,
        offset = $(tgt).offset();

    return {
      x: e.pageX - offset.left - this.state.canvas.paddingLeft - this.state.canvas.borderLeft,
      y: e.pageY - offset.top - this.state.canvas.paddingTop - this.state.canvas.borderTop
    };
  };

  /**
   * When called, writes the selected portion of the image to a hidden canvas and exports its data.
   * This is a very slow function and should only be called on mouseup, and only if the user enabled the feature.
   */
  CanvasCrop.prototype.getRawCroppedImageData = function() {
    var workCanvas = document.createElement('canvas'),
        workContext = workCanvas.getContext('2d'),
        coords = this.getCropCoordinates(true),
        packed;

    // The data array to return
    packed = {
      x: coords.x,
      y: coords.y,
      w: coords.w,
      h: coords.h,
      image: {
        w: this.image.width,
        h: this.image.height
      }
    };

    // Set the canvas dimensions in order to crop properly.
    workCanvas.width = coords.w;
    workCanvas.height = coords.h;

    try {
      // Draw the selected image into the canvas.
      workContext.drawImage(this.image, coords.x, coords.y, coords.w, coords.h, 0, 0, coords.w, coords.h);

      // This may throw a security exception.
      packed.data = workCanvas.toDataURL('image/png');
    } catch(e) {
      packed.data = null;
      packed.exception = e;
    }

    return packed;
  };

  /**
   * @constructor
   */
  Shape = function() {};

  Shape.prototype.constructor = Shape;

  // Define a static property.
  Object.defineProperty(Shape, 'strokeStyle', {
    value: 'rgba(255, 255, 255, 0.5)'
  });

  /**
   * If the shape is drawn from a lower to upper quadrant, width and/or height will be negative.
   * Normalizing to positive numbers makes working with coordinates easier.
   */
  Shape.prototype.normalize = function() {
    this.x = this.w < 0 ? this.x + this.w : this.x;
    this.y = this.h < 0 ? this.y + this.h : this.y;
    this.w = Math.abs(this.w);
    this.h = Math.abs(this.h);
  };

  Shape.prototype.draw = function() {
    throw 'Method "draw" must be implemented on objects inheriting from Shape.';
  };

  Shape.prototype.contains = function() {
    throw 'Method "contains" must be implemented on objects inheriting from Shape.';
  };

  /**
   * @constructor
   */
  Rectangle = function() {
    this.update.apply(this, arguments);
  };

  Rectangle.prototype = Object.create(Shape.prototype);

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   */
  Rectangle.prototype.update = function(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.normalize();
  };

  /**
   * @param {CanvasRenderingContext2D} context
   */
  Rectangle.prototype.draw = function (context) {
    context.beginPath();
    context.rect(this.x, this.y, this.w, this.h);
    context.strokeStyle = Shape.strokeStyle;
    context.strokeRect(this.x, this.y, this.w, this.h);
  };

  /**
   * Determine if a point is inside the shape's bounds.
   *
   * @param mx
   * @param my
   * @returns {boolean}
   */
  Rectangle.prototype.contains = function (mx, my) {
    return (this.x <= mx) && (this.x + this.w >= mx) && (this.y <= my) && (this.y + this.h >= my);
  };

  /**
   * @constructor
   */
  Ellipse = function() {
    this.update.apply(this, arguments);
  };

  Ellipse.prototype = Object.create(Shape.prototype);

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   */
  Ellipse.prototype.update = function (x, y, w, h) {
    this.kappa = 0.5522848;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.ox = (w / 2) * this.kappa; // control point offset horizontal
    this.oy = (h / 2) * this.kappa; // control point offset vertical
    this.xe = x + w; // x-end
    this.ye = y + h; // y-end
    this.xm = x + w / 2; // x-middle
    this.ym = y + h / 2; // y-middle
    this.xr = w / 2; // x-radius
    this.yr = h / 2; // y-radius
  };

  /**
   * http://math.stackexchange.com/a/76463
   *
   * @param {number} mx
   * @param {number} my
   * @returns {boolean}
   */
  Ellipse.prototype.contains = function (mx, my) {
    return (Math.pow(mx - this.xm, 2) / Math.pow(this.xr, 2)) +
        (Math.pow(my - this.ym, 2) / Math.pow(this.yr, 2)) <= 1;
  };

  /**
   * Draws an ellipse using Bezier curves. See http://stackoverflow.com/a/2173084/2651279
   *
   * @param {CanvasRenderingContext2D} context
   */
  Ellipse.prototype.draw = function (context) {
    var x = this.x,
        y = this.y,
        ox = this.ox,
        oy = this.oy,
        xe = this.xe,
        ye = this.ye,
        xm = this.xm,
        ym = this.ym;

    context.beginPath();
    context.moveTo(x, ym);
    context.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
    context.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
    context.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
    context.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);
    context.strokeStyle = Shape.strokeStyle;
    context.stroke();
  };

  /**
   * jQuery plugin definition
   *
   * @param {object} option
   * @returns {*}
   */
  $.fn.canvasCrop = function (option) {
    return this.each(function() {
      var $this   = $(this),
          data    = $this.data('canvas-crop'),
          options = $.extend({}, CanvasCrop.DEFAULTS, $this.data(), typeof option == 'object' && option);

      if (!data) $this.data('canvas-crop', (data = new CanvasCrop(this, options)));
    });
  };

  $.fn.canvasCrop.Constructor = CanvasCrop;
}));
