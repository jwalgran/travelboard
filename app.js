
/**
 * Module dependencies.
 */

var express = require('express');
var ejs = require('ejs');
var transit = require('./transit');

var app = module.exports = express.createServer();

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

// Routes

app.get('/', function(req, res){
  res.render('index', {
    title: 'Express'
  });
});

app.get('/from/:from/to/:to', function(req, res) {
    res.contentType('application/json');
    transit.getRoutes(req.params.from.replace(/_/g, ' '), req.params.to.replace(/_/g, ' '), function(err, routes) {
        if (!err && !routes.error) {
            res.end(JSON.stringify(routes, undefined, 4));
        }
        else {
            res.end(JSON.stringify(routes));
        }
    });
});

app.listen(3000);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
