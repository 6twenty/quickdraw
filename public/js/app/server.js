// =========
// server.js
// =========
// 
// Handles all server interactions to update the current drawing.

;(function() {

  // create a simple object from a path which stores
  // the path string and pen attributes ready for
  // storage as JSON on the server
  qd.server.serializePath = function(path) {
    return {
      string: path._raphael.attr('path') + '',
      pen: {
        size: path._raphael.attr('stroke-width'),
        color: path._raphael.attr('stroke'),
        opacity: path._raphael.attr('opacity')
      }
    }
  }

  // reinstate a path which has been serialized using
  // the above function
  // note: this action also renders the path to the UI
  qd.server.deserializePath = function(object) {
    var path = new qd.Path();
    path._raphael = qd.canvas.path(object.string).attr({
      'stroke'          : object.pen.color,
      'opacity'         : object.pen.opacity,
      'stroke-width'    : object.pen.size,
      'stroke-linecap'  : 'round',
      'stroke-linejoin' : 'round'
    });
    return path;
  }

  // make a server request which adds or removes the latest path
  qd.server.patch = function(path) {
    var data = { _method: 'patch' };

    if (path) {
      data.path = JSON.stringify(qd.server.serializePath(path));
    } else {
      data._delete = '1';
    }

    $.ajax({
      type     : 'POST',
      url      : '/' + qd.id,
      data     : data,
      dataType : 'json'
    });
  }

})();