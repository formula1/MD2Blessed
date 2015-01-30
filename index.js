// Markdown to Contrib
var util = require("util");
var Transform = require("stream").Transform;
var Writable = require("stream").Writable;
var async = require("async");
var blessed = require('blessed');
var highlight = require('console-highlight');

var Blocks = {
  "horizontal line":{
    label:"horizontal line",
    limit:1,
    pattern: [ /^\s{0,3}(?:(?:\*+\s*){3,}|(?:\-+\s*){3,}|(?:_+\s*){3,})$/ ],
    transform: function(line){return "";},
    compile:function(line,state){
			var top = state.top;
			state.top += 2;
      return blessed.Line({
				orientation:"horizontal", 
				width:"100%",
				height:2,
				top:top,
				style:{
		      bg:"white",
		      fg:"black",
				},
			});
    }
  },
  "header":{
    label:"header",
    pattern: [ /^#{1,5}\s+.*/ ],
    limit:1,
    transform: function(line){
      return line;
    },
    compile:function(lines,state){
      var m = /^(#+)(\s+)(.*)(\s*)$/.exec(lines);
      line = m[2];
      var size = m[0].length;
			var top = state.top;
			state.top += 1;
      return blessed.Text({
        width:"100%",
				shrink:true,
				top:top,
				height:1,
				content: lines,
        padding:{
          left:0,
          right:0,
          top:size,
          bottom:size
        },
				style:{
		      bg:"white",
		      fg:"black",
				},
      });
    }
  },
  "idented code":{
    label:"indented code",
    pattern: [
          /^\s{4}\S+.*/,
          /^\s*$/
    ],
    transform: function(line){
      if(/^\s*$/.test(line)) return "";
      return /^\s{4}(.*)/.exec(line)[0];
    },
    compile:function (lines,state){
      while(lines.length){
        if(lines.charAt(0) == "\n") lines.shift();
        else break;
      }
      while(lines.length){
        if(lines.charAt(lines.length-1) == "\n") lines.pop();
        else break;
      }
			var top = state.top;
			state.top += lines.split("\n").length;
      return blessed.Text({
        width: '50%',
				top:top,
				shrink:true,
        content: highlight(lines),
        tags: true,
        border: {
          type: 'line'
        },
      });
    }
  },
  "fenced code":{
    label:"fenced code",
    pattern: [
          /^(?:(?:`{3,})|(?:~{3,})).*/,
          /^.*$/
    ],
    transform: function(line,curbox){
      if(!curbox.tickLen){
        curbox.tickType = line.charAt(0);
        line.replace("~","`");
        var l = /^((`{3,})|(~{3,}))(.*)$/.exec(line);
        curbox.lang = l[1];
        curbox.tickLen = l[0].length;
        return "";
      }
      if(curbox.tickType == "~" && 
      new RegExp("^(?:~{"+curbox.tickLen+",}).").test(line)
      ){
        return false;
      }
      if(curbox.tickType == "`" && new RegExp("^(?:`{"+curbox.tickLen+",}).").test(line)){
        return false;
      }
      return line;
    },
    compile:function (lines,state){
      while(lines.length){
        if(lines.charAt(0) == "\n") lines.shift();
        else break;
      }
      while(lines.length){
        if(lines.charAt(lines.length-1) == "\n") lines.pop();
        else break;
      }
			var top = state.top;
			state.top += lines.split("\n").length;
      return blessed.Text({
        width: '50%',
				shrink:true,
				top:top,
        content: highlight(lines, {language:curbox.lang}),
        tags: true,
        border: {
          type: 'line'
        },
      });
    }
  },
  "paragraph": {
    label:"paragraph",
    pattern:[ /.*\S.*/ ],
    transform: function(line, curbox){
      return /^(\s*)(.*)/.exec(line)[1];
    },
    compile: function(lines, state){
			var top = state.top;
			state.top += lines.split("\n").length;
      return blessed.Text({
				top:top,
        width: '50%',
				shrink:true,
        content: lines,
        border: {
          type: 'line'
        },
      });
    }
  }
};


function compileText(text, element, state, next){
  if(typeof element == "function"){
    next = element;
		state = {};
    element = blessed.Element({
      scrollable:true,
      width:"100%"
    });
  }else if(typeof state == "function"){
    next = state;
		state = {};
	}
  text = text.split("\n");
  async.eachSeries(text,function(line,next){
	  var ii;
		var temp;
		var temp2;
    for(ii=0;ii<line.length;ii++){
      if(line.charAt(ii) == "\t"){
        temp = line.substring(0,ii);
        temp2 = 4-ii%4;
        while(temp2--){
          temp += " ";
        }
        temp += line.substring(ii+1);
        line = temp;
      }
    }
    if(state.curbox){
      if(state.curbox.limit > state.curbox.contents.length){
        element.append(state.curbox.b.compile(state.curbox.contents.join("\n"), state));
        state.curbox = false;
      }else{
        temp = false;
        ii = state.curbox.b.pattern.length;
        while(ii--){
          temp = state.curbox.b.pattern[ii].test(line);
          if(temp) break;
        }
        if(temp){
          temp = state.curbox.b.transform(line,state.curbox);
          if(temp === false){
            element.append(state.curbox.b.compile(
                state.curbox.contents.join("\n"),
		            state
						));

            state.curbox = false;
          }else{
          state.curbox.contents.push(temp);
          }
          return next();
        }else{
          element.append(state.curbox.b.compile(
            state.curbox.contents.join("\n"),
          	state
					));

          state.curbox = false;
        }
      }
    }
    for(var i in Blocks){
      if(!Blocks[i].pattern[0].test(line)) continue;
      state.curbox = {
        b:Blocks[i],
        contents: [],
      };
      state.curbox.contents.push(state.curbox.b.transform(line,state.curbox));
      break;
    }
    process.nextTick(next);
  },function(err,results){
    next(err,element);
  });
};

function MDTransform(screen, options){
  Writable.call(this, options);
  this.screen = (screen)?screen:blessed.screen();
	this.elem = blessed.Element({
		scrollable:true,
		shrink:true,
		width:"100%"
	});
	this.screen.append(this.elem);
	this.buffer = new Buffer("");
	this.state = {top:0};
}

util.inherits(MDTransform, Writable);

MDTransform.prototype._write = function(chunk, encoding, done) {
	chunk = Buffer.concat([this.buffer, chunk]);
	this.buffer = new Buffer("");
  var l = chunk.length;
  var s;
  while(l--){
    if(chunk.readUInt8(l) == 10){ //new line char
      this.buffer = chunk.slice(l);
      chunk = chunk.slice(0,l);
      break;
    }
  }
  compileText(chunk.toString("utf8"), this.elem, this.state, function(e,elem){
    if(e) return this.emit("error", e);
    done();
  }.bind(this));
};

module.exports.transform = MDTransform;
module.exports.compileText = compileText;
if(!module.parent){
  var fs = require("fs");
  var infile;
  process.argv.forEach(function (val, index, array) {
    if(/^input\s*=\s*\S+/.test(val)){
      infile = val.replace(" ","").split("=")[1];
    }
  });
  if(infile){
    fs.createReadStream(infile).pipe(new MDTransform()).on("finish", function(){
      this.screen.render();
    });
  }else{
    var screen = blessed.screen();
    process.stdin.on('data', function(chunk,encoding) {
			chunk = chunk.toString(encoding);
			if(!(/\n$/.test(chunk))) return
			chunk = chunk.substring(0,chunk.length-1);
      fs.createReadStream(chunk)
      .pipe(new MDTransform(screen))
      .on("end", function(){
        screen.render();
      });
    });
  }

}
