(function (qd, api) {

  // Constants
  // ---------

  var XMLNS = 'http://www.w3.org/2000/svg';
  var SVG   = document.getElementById('svg');

  // Class: Segment
  // --------------

  function Segment(point, handleIn, handleOut) {
    this.point = point;
    if (handleIn) this.handleIn = handleIn;
    if (handleOut) this.handleOut = handleOut;
  }

  // Class: Point
  // ------------

  function Point(x, y) {
    this.x = x;
    this.y = y;
  }

  Point.prototype = {

    toString: function toString() {
      return [ this.x, this.y ].join(',');
    },

    clone: function clone() {
      return new Point(this.x, this.y);
    },

    equals: function equals(point) {
      return this === point || point && (this.x === point.x && this.y === point.y);
    },

    getLength: function getLength() {
      return Math.sqrt(this.x * this.x + this.y * this.y);
    },

    getDistance: function getDistance(point) {
      var x = point.x - this.x;
      var y = point.y - this.y;
      var d = x * x + y * y;
      return Math.sqrt(d);
    },

    normalize: function normalize(length) {
      if (length === undefined) length = 1;
      var current = this.getLength();
      var scale = current !== 0 ? length / current : 0;
      var point = new Point(this.x * scale, this.y * scale);
      return point;
    },

    negate: function negate() {
      return new Point(-this.x, -this.y);
    },

    multiply: function multiply(n) {
      return new Point(this.x * n, this.y * n);
    },

    divide: function divide(n) {
      return new Point(this.x / n, this.y / n);
    },

    add: function add(point) {
      return new Point(this.x + point.x, this.y + point.y);
    },

    subtract: function subtract(point) {
      return new Point(this.x - point.x, this.y - point.y);
    },

    dot: function dot(point) {
      return this.x * point.x + this.y * point.y;
    }

  }

  // Class: Path
  // -----------

  function Path(state) {
    var point = state.pointer.clone();
    this.points = [ point ];

    this.error = 10; // Tolerance for smoothing

    this.colour = state.colour;
    this.size = state.size;
    this.opacity = state.opacity;

    this.layer = qd.layer;
    this.el = document.createElementNS(XMLNS, 'path');
    this.el.setAttribute('stroke', this.colour);
    this.el.setAttribute('stroke-width', this.size);
    this.el.setAttribute('opacity', this.opacity);
    this.layer.insertBefore(this.el, null);
  }

  Path.prototype = {

    update: function update(state) {
      if (this.end && state.pointer.equals(this.end)) return;
      this.end = state.pointer.clone();
      this.points.push(this.end);
    },

    render: function render() {
      var d  = '';
      var d_ = '';

      if (this.simplified) {

        // Variable width setup
        var threshold = Math.floor(this.size / 2);
        var step = Math.max(1, this.size * 0.1);
        var offset = 0;

        this.segments.forEach(function map(segment, i, segments) {
          if (i === 0) d += 'M';
          if (segment.handleIn) d += (segment.handleIn + ' ');
          d += (segment.point + ' ');
          if (segment.handleOut) d += ('C' + segment.handleOut + ' ');

          // Variable width offset
          // TODO: get the offset back to 0 for the final segment
          var diff = Math.random() >= 0.5 ? step : -step;
          if (Math.abs(offset + diff) > threshold) diff *= -1;
          offset += diff;

          // Variable width handles
          var add = { x: offset, y: offset };
          segment.point_ = segment.point.add(add);
          if (segment.handleIn) segment.handleIn_ = segment.handleIn.add(add);
          if (segment.handleOut) segment.handleOut_ = segment.handleOut.add(add);

          if (i === 0) d_ += 'M';
          if (segment.handleIn_) d_ += (segment.handleIn_ + ' ');
          d_ += (segment.point_ + ' ');
          if (segment.handleOut_) d_ += ('C' + segment.handleOut_ + ' ');
        });

      } else {

        this.points.forEach(function map(point, i, points) {
          if (i === 0) d += 'M';
          d += point;
          if (i < points.length-1) d += ' L';
        });

      }

      if (d_) d += (' ' + d_);
      this.el.setAttribute('d', d);
    },

    simplify: function simplify() {
      var points = this.points;
      var length = points.length;
      this.segments = length > 0 ? [ new Segment(points[0].clone()) ] : [];

      if (length > 1) {
        var first = 0;
        var last  = length - 1;
        var tan1  = points[1].subtract(points[0]).normalize();
        var tan2  = points[length - 2].subtract(points[length - 1]).normalize();
        this.fitCubic(first, last, tan1, tan2);
      }

      delete this.points;
      this.simplified = true;
    },

    fitCubic: function fitCubic(first, last, tan1, tan2) {
      if (last - first == 1) {
        var pt1 = this.points[first];
        var pt2 = this.points[last];
        var dist = pt1.getDistance(pt2) / 3;
        this.addCurve([pt1, pt1.add(tan1.normalize(dist)), pt2.add(tan2.normalize(dist)), pt2]);
        return;
      }

      var uPrime = this.chordLengthParameterize(first, last);
      var maxError = Math.max(this.error, this.error * this.error);
      var split;

      for (var i = 0; i <= 4; i++) {
        var curve = this.generateBezier(first, last, uPrime, tan1, tan2);
        var max = this.findMaxError(first, last, curve, uPrime);
        if (max.error < this.error) {
          this.addCurve(curve);
          return;
        }
        split = max.index;
        if (max.error >= maxError) break;
        this.reparameterize(first, last, uPrime, curve);
        maxError = max.error;
      }

      var V1 = this.points[split - 1].subtract(this.points[split]);
      var V2 = this.points[split].subtract(this.points[split + 1]);
      var tanCenter = V1.add(V2).divide(2).normalize();

      this.fitCubic(first, split, tan1, tanCenter);
      this.fitCubic(split, last, tanCenter.negate(), tan2);
    },

    addCurve: function addCurve(curve) {
      var prev = this.segments[this.segments.length - 1];
      prev.handleOut = curve[1].clone();
      var segment = new Segment(curve[3].clone());
      segment.handleIn = curve[2].clone();
      this.segments.push(segment);
    },

    chordLengthParameterize: function chordLengthParameterize(first, last) {
      var u = [0];

      for (var i = first + 1; i <= last; i++) {
        u[i - first] = u[i - first - 1] + this.points[i].getDistance(this.points[i - 1]);
      }

      for (var i = 1, m = last - first; i <= m; i++) {
        u[i] /= u[m];
      }

      return u;
    },

    generateBezier: function generateBezier(first, last, uPrime, tan1, tan2) {
      var epsilon = 10e-12;
      var pt1 = this.points[first];
      var pt2 = this.points[last];
      var C = [[0, 0], [0, 0]];
      var X = [0, 0];

      for (var i = 0, l = last - first + 1; i < l; i++) {
        var u = uPrime[i];
        var t = 1 - u;
        var b = 3 * u * t;
        var b0 = t * t * t;
        var b1 = b * t;
        var b2 = b * u;
        var b3 = u * u * u;
        var a1 = tan1.normalize(b1);
        var a2 = tan2.normalize(b2);
        var tmp = this.points[first + i].subtract(pt1.multiply(b0 + b1)).subtract(pt2.multiply(b2 + b3));

        C[0][0] += a1.dot(a1);
        C[0][1] += a1.dot(a2);
        C[1][0] = C[0][1];
        C[1][1] += a2.dot(a2);
        X[0] += a1.dot(tmp);
        X[1] += a2.dot(tmp);
      }

      var detC0C1 = C[0][0] * C[1][1] - C[1][0] * C[0][1];
      var alpha1, alpha2;

      if (Math.abs(detC0C1) > epsilon) {
        var detC0X  = C[0][0] * X[1]    - C[1][0] * X[0];
        var detXC1  = X[0]    * C[1][1] - X[1]    * C[0][1];
        alpha1 = detXC1 / detC0C1;
        alpha2 = detC0X / detC0C1;
      } else {
        var c0 = C[0][0] + C[0][1];
        var c1 = C[1][0] + C[1][1];
        if (Math.abs(c0) > epsilon) {
          alpha1 = alpha2 = X[0] / c0;
        } else if (Math.abs(c1) > epsilon) {
          alpha1 = alpha2 = X[1] / c1;
        } else {
          alpha1 = alpha2 = 0;
        }
      }

      var segLength = pt2.getDistance(pt1);
      epsilon *= segLength;
      if (alpha1 < epsilon || alpha2 < epsilon) {
        alpha1 = alpha2 = segLength / 3;
      }

      return [pt1, pt1.add(tan1.normalize(alpha1)), pt2.add(tan2.normalize(alpha2)), pt2];
    },

    findMaxError: function findMaxError(first, last, curve, u) {
      var index = Math.floor((last - first + 1) / 2);
      var maxDist = 0;

      for (var i = first + 1; i < last; i++) {
        var P = this.evaluate(3, curve, u[i - first]);
        var v = P.subtract(this.points[i]);
        var dist = v.x * v.x + v.y * v.y;
        if (dist >= maxDist) {
          maxDist = dist;
          index = i;
        }
      }

      return {
        error: maxDist,
        index: index
      };
    },

    evaluate: function evaluate(degree, curve, t) {
      var tmp = curve.slice();

      for (var i = 1; i <= degree; i++) {
        for (var j = 0; j <= degree - i; j++) {
          tmp[j] = tmp[j].multiply(1 - t).add(tmp[j + 1].multiply(t));
        }
      }

      return tmp[0];
    },

    reparameterize: function reparameterize(first, last, u, curve) {
      for (var i = first; i <= last; i++) {
        u[i - first] = this.findRoot(curve, this.points[i], u[i - first]);
      }
    },

    findRoot: function findRoot(curve, point, u) {
      var curve1 = [];
      var curve2 = [];

      for (var i = 0; i <= 2; i++) {
        curve1[i] = curve[i + 1].subtract(curve[i]).multiply(3);
      }

      for (var i = 0; i <= 1; i++) {
        curve2[i] = curve1[i + 1].subtract(curve1[i]).multiply(2);
      }

      var pt   = this.evaluate(3, curve, u);
      var pt1  = this.evaluate(2, curve1, u);
      var pt2  = this.evaluate(1, curve2, u);
      var diff = pt.subtract(point);
      var df   = pt1.dot(pt1) + diff.dot(pt2);

      if (Math.abs(df) < 10e-6) return u;
      return u - diff.dot(pt1) / df;
    }

  }

  // Main loop
  // ---------

  requestAnimationFrame(function loop() {

    // Is drawing if mousedown (but not shiftdown)
    if (qd.state.mousedown && !qd.state.shiftdown && !qd.state.moving) {

      // If not previously drawing, set up path
      if (!qd.state.drawing) {
        qd.setupDraw();
        qd.state.drawing = true;
      }

      qd.handleDraw();

    // Is moving if mousedown (with shiftdown)
    } else if (qd.state.mousedown && qd.state.shiftdown && !qd.state.drawing) {

      if (!qd.state.moving) {
        qd.setupMove();
        qd.state.moving = true;
      }

      qd.handleMove();

    // If was previously drawing, cache the path
    } else if (qd.state.drawing) {

      qd.finishDraw();
      qd.state.drawing = false;

    } else if (qd.state.moving) {

      qd.finishMove();
      qd.state.moving = false;

    }

    // Infinite loop
    requestAnimationFrame(loop);

  });

  // State
  // -----

  qd.path = null;
  qd.paths = [];
  qd.redos = [];
  qd.layer = document.getElementById('layer-5');

  qd.state = {
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

  // Handlers
  // --------

  qd.mouseup = function mouseup(e) {
    qd.state.mousedown = false;
    qd.state.shiftdown = false;
  }

  window.addEventListener('mouseup', qd.mouseup);
  window.addEventListener('mouseleave', qd.mouseup);

  qd.mousemove = function mousemove(e) {
    qd.state.shiftdown = e.shiftKey;
    qd.state.mousedown = e.which === 1;
    qd.state.xy = [ e.pageX, e.pageY ];
    qd.state.pointer.x = e.pageX + qd.state.offset[0];
    qd.state.pointer.y = e.pageY + qd.state.offset[1];
  }

  window.addEventListener('mousemove', qd.mousemove);
  window.addEventListener('mousedown', qd.mousemove);

  qd.setOffset = function setOffset(x, y) {
    qd.state.offset = [x, y];
    SVG.viewBox.baseVal.x = x;
    SVG.viewBox.baseVal.y = y;
  }

  qd.resize = function resize() {
    SVG.viewBox.baseVal.width = window.innerWidth;
    SVG.viewBox.baseVal.height = window.innerHeight;
  }

  window.addEventListener('resize', qd.resize);
  qd.resize();

  qd.keyevent = function keyevent(e) {
    qd.state.shiftdown = e.shiftKey;
    SVG.style.cursor = e.shiftKey ? 'move' : '';
  }

  window.addEventListener('keydown', qd.keyevent);
  window.addEventListener('keyup', qd.keyevent);

  // Drawing
  // -------

  qd.setupDraw = function setupDraw() {
    qd.redos = [];
    qd.path = new Path(qd.state);
  }

  qd.handleDraw = function handleDraw() {
    qd.path.update(qd.state);
    qd.path.render();
  }

  qd.finishDraw = function finishDraw() {
    qd.path.update(qd.state);
    qd.path.simplify();
    qd.path.render();
    qd.paths.push(qd.path);
    qd.path = null;
  }

  // Moving
  // ------

  qd.setupMove = function setupMove() {
    if (!qd.state.moveOrigin) {
      var x = qd.state.xy[0] + qd.state.offset[0];
      var y = qd.state.xy[1] + qd.state.offset[1];
      qd.state.moveOrigin = [ x, y ];
    }
  }

  qd.handleMove = function handleMove() {
    var x = qd.state.xy[0] - qd.state.moveOrigin[0];
    var y = qd.state.xy[1] - qd.state.moveOrigin[1];
    qd.setOffset(-x, -y);
  }

  qd.finishMove = function finishMove() {
    qd.state.moveOrigin = null;
  }

  // API
  // ---

  api.undo = function () {
    var path = qd.paths.pop();
    if (!path) return;
    path.layer.removeChild(path.el);
    qd.redos.push(path);
  }

  api.redo = function () {
    var path = qd.redos.pop();
    if (!path) return;
    path.layer.insertBefore(path.el, null);
    qd.paths.push(path);
  }

  Object.defineProperties(api, {

    layer: {
      get: function () { return +qd.layer.id.split('-')[1]; },
      set: function (num) { qd.layer = document.getElementById('layer-' + num); }
    },

    color: {
      get: function () { return qd.state.colour; },
      set: function (colour) { qd.state.colour = colour; }
    },

    size: {
      get: function () { return qd.state.size; },
      set: function (size) { qd.state.size = size; }
    },

    opacity: {
      get: function () { return qd.state.opacity; },
      set: function (opacity) { qd.state.opacity = opacity; }
    }

  });

})(Object.create(null), window.app = Object.create(null));
