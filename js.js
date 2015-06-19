(function (app) {

  // Constants
  // ---------

  var XMLNS = 'http://www.w3.org/2000/svg';
  var SVG   = document.getElementById('svg');

  // Classes
  // -------

  Point.prototype.toArray = function toArray() {
    return [ this.x, this.y ];
  }

  // L  x,y
  Point.prototype.lineTo = function lineTo() {
    return 'L' + this.toArray().join(',');
  }

  // C  c1x,c1y  c2x,c2y  x,y
  Point.prototype.curveTo = function curveTo() {
    var cp1 = this.cp1.toArray().join(',');
    var cp2 = this.cp2.toArray().join(',');
    var point = this.toArray().join(',');
    return 'C' + [ cp1, cp2, point ].join(' ');
  }

  function DrawPath(state) {
    this.path = new Path();
    this.points = [];
    this.origin = state.pointer.clone();
    this.path.add(this.origin);
    this.d = 'M' + [ this.origin.x, this.origin.y ].join(',') + ' ';

    this.colour = state.colour;
    this.size = state.size;
    this.opacity = state.opacity;

    this.el = document.createElementNS(XMLNS, 'path');
    this.el.setAttribute('stroke', this.colour);
    this.el.setAttribute('stroke-width', this.size);
    this.el.setAttribute('opacity', this.opacity);
    SVG.insertBefore(this.el, null);
  }

  DrawPath.prototype = {
    update: function update(state) {
      if (this.end && state.pointer.equals(this.end)) return;
      this.end = state.pointer.clone();
      this.points.push(this.end);
      this.path.add(this.end);
    },

    render: function render() {
      var d = this.d + this.points.map(function map(point, i, points) {
        return this.simplified ? point.curveTo() : point.lineTo();
      }.bind(this)).join(' ');

      if (this.simplified && this.points.length > 1) {
        d += this.renderReverse();
      }

      this.el.setAttribute('d', d);
    },

    renderReverse: function renderReverse() {
      var threshold = Math.floor(this.size / 2) - 2;
      if (threshold < 0) threshold = 0;
      var step = this.size * 0.1;
      if (step < 1) step = 1;
      var previousOffset = 0;

      // Same curves, but in reverse, and closing the path
      var d = this.points.reverse().map(function map(point, i, points) {
        // Use control points (swapped) from `point` but destination from the *next* point
        var next = points[i+1];

        if (next) {
          // Tweak the coordinates to vary the path width
          var diff = Math.random() >= 0.5 ? step : -step;
          var offset = previousOffset + diff;
          if (Math.abs(offset) > threshold) {
            offset = previousOffset - (offset > 0 ? step : -step);
          }

          previousOffset = offset;
          point.cp1.x += offset;
          point.cp1.y += offset;
          point.cp2.x += offset;
          point.cp2.y += offset;
          next.x += offset;
          next.y += offset;
        } else {
          next = this.origin;
        }


        var cp1 = point.cp2.toArray().join(',');
        var cp2 = point.cp1.toArray().join(',');
        var target = next.toArray().join(',');
        return 'C' + [ cp1, cp2, target ].join(' ');
      }.bind(this)).join(' ');

      return ' ' + d + 'z';
    },

    simplify: function simplify() {
      this.simplified = true;
      this.path.simplify(10);
      var segments = this.path.getSegments();

      var previousSegment = segments[0];
      for (var i=1, l=segments.length; i<l; i++) {
        var segment = segments[i];
        var x = segment.point.x;
        var y = segment.point.y;
        var x1 = previousSegment.point.x + previousSegment.handleOut.x;
        var y1 = previousSegment.point.y + previousSegment.handleOut.y;
        var x2 = segment.point.x + segment.handleIn.x;
        var y2 = segment.point.y + segment.handleIn.y;

        segment.point = new Point(segment.x, segment.y);
        segment.point.cp1 = new Point(x1, y1);
        segment.point.cp2 = new Point(x2, y2);
        previousSegment = segment;
      }

      this.points = segments.map(function (segment) { return segment.point; });
      this.points.shift(); // First segment is the origin
    }
  }

  // Main loop
  // ---------

  requestAnimationFrame(function loop() {

    // Is drawing if mousedown (but not shiftdown)
    if (app.state.mousedown && !app.state.shiftdown && !app.state.moving) {

      // If not previously drawing, set up path
      if (!app.state.drawing) {
        app.setupDraw();
        app.state.drawing = true;
      }

      app.handleDraw();

    // Is moving if mousedown (with shiftdown)
    } else if (app.state.mousedown && app.state.shiftdown && !app.state.drawing) {

      if (!app.state.moving) {
        app.setupMove();
        app.state.moving = true;
      }

      app.handleMove();

    // If was previously drawing, cache the path
    } else if (app.state.drawing) {

      app.finishDraw();
      app.state.drawing = false;

    } else if (app.state.moving) {

      app.finishMove();
      app.state.moving = false;

    }

    // Infinite loop
    requestAnimationFrame(loop);

  });

  // State
  // -----

  app.path = null;
  app.paths = [];
  app.redos = [];

  app.state = {
    xy: [ 0, 0 ],
    offset: [ 0, 0 ],
    mousedown: false,
    shiftdown: false,
    drawing: false,
    pointer: new Point(),
    colour: '#000',
    size: 10,
    opacity: 1
  }

  app.mouseup = function mouseup(e) {
    app.state.mousedown = false;
    app.state.shiftdown = false;
  }

  window.addEventListener('mouseup', app.mouseup);
  window.addEventListener('mouseleave', app.mouseup);

  app.mousemove = function mousemove(e) {
    app.state.shiftdown = e.shiftKey;
    app.state.mousedown = e.which === 1;
    app.state.xy = [ e.pageX, e.pageY ];
    app.state.pointer.x = e.pageX + app.state.offset[0];
    app.state.pointer.y = e.pageY + app.state.offset[1];
  }

  window.addEventListener('mousemove', app.mousemove);
  window.addEventListener('mousedown', app.mousemove);

  app.setOffset = function setOffset(x, y) {
    app.state.offset = [x, y];
    SVG.viewBox.baseVal.x = x;
    SVG.viewBox.baseVal.y = y;
  }

  app.resize = function resize() {
    SVG.viewBox.baseVal.width = window.innerWidth;
    SVG.viewBox.baseVal.height = window.innerHeight;
  }

  window.addEventListener('resize', app.resize);
  app.resize();

  app.keyevent = function keyevent(e) {
    app.state.shiftdown = e.shiftKey;
    SVG.style.cursor = e.shiftKey ? 'move' : '';
  }

  window.addEventListener('keydown', app.keyevent);
  window.addEventListener('keyup', app.keyevent);

  // Drawing
  // -------

  app.setupDraw = function setupDrawPath() {
    app.redos = [];
    app.path = new DrawPath(app.state);
  }

  app.handleDraw = function handleDraw() {
    app.path.update(app.state);
    app.path.render();
  }

  app.finishDraw = function finishDraw() {
    app.path.update(app.state);
    app.path.simplify();
    app.path.render();
    app.paths.push(app.path);
    app.path = null;
  }

  // Moving
  // ------

  app.setupMove = function setupMove() {
    if (!app.state.moveOrigin) {
      var x = app.state.xy[0] + app.state.offset[0];
      var y = app.state.xy[1] + app.state.offset[1];
      app.state.moveOrigin = [ x, y ];
    }
  }

  app.handleMove = function handleMove() {
    var x = app.state.xy[0] - app.state.moveOrigin[0];
    var y = app.state.xy[1] - app.state.moveOrigin[1];
    app.setOffset(-x, -y);
  }

  app.finishMove = function finishMove() {
    app.state.moveOrigin = null;
  }

  // API
  // ---

  app.undo = function undo() {
    var path = app.paths.pop();
    if (!path) return;
    SVG.removeChild(path.el);
    app.redos.push(path);
  }

  app.redo = function redo() {
    var path = app.redos.pop();
    if (!path) return;
    SVG.insertBefore(path.el, null);
    app.paths.push(path);
  }

})(window.app = {});
