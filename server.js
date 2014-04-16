var connect = require('connect'),
    port;

// Specify port as the first argument on the command line.
port = process.argv[2] || 8080;

connect.createServer(
  connect.static(__dirname + '/examples')
).listen(port);

console.log('jQuery Canvas Crop ready on port ' + port);
