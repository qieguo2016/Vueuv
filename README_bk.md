# Vueuv

**Vueuv**是一个轻量的前端MVVM框架，是在研究Vue双向绑定实现原理的时候参照着Vue捣鼓出来的轮子，Vue的绑定指令基本都实现了一遍。
MVVM原理实现非常巧妙，真心佩服作者的构思；编译部分没用源码的方式实现，自己捣鼓着实现的，过程真是既烧脑也获益良多：

> 不造个轮子，你还真以为你会写代码了？

## How to use

引入[Vueuv.js](https://github.com/qieguo2016/vueuv/master/dist/Vueuv.js)后，用法就跟Vue一毛一样了：

```html
<div id="app">
  {{ message }}
</div>
```

```javascript
var app = new Vue({
  el: '#app',
  data: {
    message: 'Hello Vue!'
  }
})
```

渲染后的HTML是这样的：

```html
<div id="app">
  Hello Vue!
</div>
```

其他的指令也是一样的语法，更多指令请看Vue的文档http://cn.vuejs.org/v2/guide/，这里就不再赘述了。
现在Vueuv还没加Filter语法，另外CSS和style指令暂时只支持对象语法，数组语法还没来得及做，以后爽了的时候我会考虑补上去的。

代码目前还是用es5写的，打包也是手动拼装的，这方面不打算折腾了，下面来点**干货**，分享下基本实现和编码过程的一些思考吧。

## 双向绑定核心

双向绑定的实现核心有两点：1、Object.defineProperty劫持对象的getter、setter，从而实现对数据的监控。2、发布／订阅者模式实现数据与视图的自动同步。

1. Object.defineProperty顾名思义，就是用来定义对象属性的，这里我们主要在getter和setter函数里面插入一些处理方法，当对象被读写的时候处理方法就会被执行了。
关于这个方法的更具体解释，可以看MDN上的解释（[戳我](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty)）；

2. 发布/订阅者模式，其实就是我们addEventListener那套东西。自己手动实现一个也非常简单：

```javascript
function EventHandle() {
	var events = {};
	this.on = function (event, callback) {
		callback = callback || function () { };
		if (typeof events[event] === 'undefined') {
			events[event] = [callback];
		} else {
			events[event].push(callback);
		}
	};

	this.emit = function (event, args) {
	  events[event].forEach(function (fn) {
			fn(args);
		});
	};

	this.off = function (event) {
		delete events[event];
	};
}
```

视图的变化引发数据更新可以用监听input事件的方式直接修改数据来实现，而数据的变动驱动视图的更新则需要手动实现。
参照订阅发布者模式，我们可以将视图更新方法注册到事件列表中，而更新消息则由setter触发，更新消息会触发视图更新函数，这样就实现了数据到视图的更新。

## 模块分析

为了更好分析整个系统，接下来分成三个大模块来展开。首先是订阅/发布者模式中的发布者，在Vue中发布者就是观察数据模型并发出更新消息的Observer。

### Observer

我们都知道要在setter里面发布更新消息，但是一个变量会被多个表达式所依赖，怎么找出依赖的表达式并更新呢？如果是用Angular1.x中的脏检查来实现，那么遍历所有被监视的值，找出脏数据然后更新视图就可以了。
但是Vue的实现却是更为精细的依赖管理，找到依赖该变量的表达式列表，然后更新列表中表达式的值，再去更新视图。显然，关键的一步就是依赖列表的构建了。
想当然的我们肯定是在解析表达式的时候收集变量，然后用一个`依赖列表[变量a]`的数组/哈希来依次保存依赖该变量a的表达式。Vue的做法也是类似，但是实在是高明太多。直接看代码：

```javascript
Observer.prototype.observe = function (data) {
	var self = this;
	// 设置开始和递归终止条件
	if (!data || typeof data !== 'object') {
		return;
	}
	Object.keys(data).forEach(function (key) {
		self.defineReactive(data, key, data[key]);
	});
};

Observer.prototype.defineReactive = function (data, key, val) {
	var dep = new Dep();
	var self = this;
	self.observe(val);   // 递归对象属性到基本类型为止
	Object.defineProperty(data, key, {
		enumerable  : true,    // 枚举
		configurable: false,   // 不可再配置
		get         : function () {
			Dep.target && dep.addSub(Dep.target);
			return val;
		},
		set         : function (newVal) {
			if (val === newVal) {
				return;
			}
			val = newVal;  // setter本身已经做了赋值，val作为一个闭包变量，保存最新值
			self.observe(newVal);
			dep.notify();  // 触发通知
		},
	});
};
```

setter里面跟我们想的一样，更新数据的时候发出通知，这里我们可能会漏掉的是对newVal的监控，设置值之后当然也要监控新值了。
再看看getter，可以看到依赖列表是在getter里面添加的！并不是在解析的时候另调用一个方法来创建依赖列表！
而且依赖列表是作为一个闭包存在，每个变量单独一个列表！并不是像我想的那样用一个全局的结构来保存依赖列表！
而由于getter除了初次编译之外后面每次使用都会触发，所以还增加了一个标识来控制是否添加依赖列表，为了能从外部传入，标识挂在了Dep构造函数上！
Dep上的属性是被所有Dep的实例共享的，但由于js是单线程的，所以在一个时刻只有一个Dep生效，在添加完监视后移掉target即可保证不会影响到其他变量！
这一做法堪称神来之笔，并没有很高深的东西，但我相信绝大部分人永远也想不到如此巧妙的实现。

依赖Dep的构造就很简单了，跟我们上文的EventHandle是一样的，这里加了一点去重。

```javascript
function Dep() {
	this.subs = {};
};

Dep.prototype.addSub = function (target) {
	if (!this.subs[target.uid]) {  //防止重复添加
		this.subs[target.uid] = target;
	}
};

Dep.prototype.notify = function () {
	for (var uid in this.subs) {
		this.subs[uid].update();
	}
};
```

### Watcher

看完了发布者，接下来看看订阅者Watcher。订阅者的功能比较简单，就是接收发布者的消息，然后调用相应的更新方法去更新视图。
每一个订阅者对应一个表达式，这里要注意的就是Dep.target的赋值与清除。这里最重要最有意思的是用来计算表达式的computeExpression这个方法，文末会结合编译器一起介绍。

```javascript
function Watcher(exp, scope, callback) {
	this.value = null;
	this.update();  //初始化时，触发添加到监听队列
}

Watcher.prototype = {
	get   : function () {
		Dep.target = this;
		var value = computeExpression(this.exp, this.scope);  // 表达式求值的时候添加监听
		Dep.target = null;  
		return value;
	},
	update: function () {
		var newVal = this.get();
		if (this.value != newVal) {
			this.callback && this.callback(newVal, this.value);
			this.value = newVal;
		}
	}
}
```

### Compiler

以上两步已经实现了一个订阅/发布者模式，接下来就是如何将模板与这两者关联起来了，这就轮到Compiler出场了。Compiler主要是提取模板中的指令，然后将数据与模板绑定起来。

> PS：这里参照的是Vue 1.x版的Compiler，2.x的实现已经用上了AST了，有时间你们就研究一下吧~~~

为了提高效率，Vue首先将模板的dom结构复制到文档片段中，然后在文档片段中进行编译，最后将编译好的文档片段插入dom树中。主体代码如下：

```javascript
function Compiler(options) {
	this.$el = options.el;
	this.vm = options.vm;
	if (this.$el) {
		this.$fragment = nodeToFragment(this.$el);
		this.compile(this.$fragment);
		this.$el.appendChild(this.$fragment);
	}
}

Compiler.prototype = {
	compile: function (node, scope) {
		var self = this;
		if (node.childNodes && node.childNodes.length) {
			[].slice.call(node.childNodes).forEach(function (child) {
				if (child.nodeType === 3) {
					self.compileTextNode(child, scope);
				} else if (child.nodeType === 1) {
					self.compileElementNode(child, scope);
				}
			});
		}
	},
	compileTextNode: function (node, scope) {
		var text = node.textContent.trim();
		if (!text) {
			return;
		}
		var exp = parseTextExp(text);
		scope = scope || this.vm;
		this.textHandler(node, scope, exp);
	},
	compileElementNode: function (node, scope) {
		var attrs = node.attributes;
		var self = this;
		scope = scope || this.vm;
		[].forEach.call(attrs, function (attr) {
			var attrName = attr.name;
			var exp = attr.value;
			var dir = checkDirective(attrName);
			if (dir.type) {
				var handler = self[dir.type + 'Handler'].bind(self);  // 不要漏掉bind(this)，否则其内部this指向会出错
				handler && handler(node, scope, exp, dir.prop);
				node.removeAttribute(attrName);
			}
		});
	},
}
```

Compiler主流程是对dom树的递归编译，分为文本节点和元素节点两种分支。

1. 文本节点编译的关键是提取`{{}}`内的表达式，也即是parseTextExp函数，
其作用是将'a {{b+"text"}} c {{d+Math.PI}}' 这样的字符串转换成 '"a " + b + "text" + " c" + d + Math.PI'这样的表达式。

```javascript
function parseTextExp(text) {
	var regText = /\{\{(.+?)\}\}/g;
	var pieces = text.split(regText);
	var matches = text.match(regText);
	var tokens = [];
	pieces.forEach(function (piece) {
		if (matches && matches.indexOf('{{' + piece + '}}') > -1) {    // 注意排除无{{}}的情况
			tokens.push(piece);
		} else if (piece) {
			tokens.push('`' + piece + '`');
		}
	});
	return tokens.join('+');
}
```

2. 元素节点就要提取各种`v-xxx`指令，然后做三件事：1) 根据指令类型设置节点的属性并将指令内的变量与vm绑定起来; 2) 将表达式加入到监控（订阅者）中 3) 指定相应的视图更新方法。

1) 将表达式加入监控就是实例化Watcher，将更新方法传到Watcher的回调函数中。

```javascript
Compiler.prototype = {
	// ...
	bindWatcher: function (node, scope, exp, dir, prop) {
		var updateFn = updater[dir];
		var watcher = new Watcher(exp, scope, function (newVal) {
			updateFn && updateFn(node, newVal, prop);
		});
	},
}
```

2) 变量绑定非常简单，要注意的作用域要以参数的形式传进来，这样才能做各个层次的绑定。而不同的指令有不同的处理方式，下面简单介绍比较有意思的指令编译

- model双向绑定(v-model="expression")，这里比较有意思的我既要使用监视器来更新input的value，又要用value去更新vm的数据，所以在输入的时候就形成了一个循环依赖了。
当然，更新函数会判断新旧值，只有新旧值不同才调用更新方法。然后，我们的中文输入法却因此而不能正常工作了：
input事件的value取值会取拼音字母，然后更新函数直接将字母拿去反过来更新了value，所以根本就不能选词了。解决办法非常简单，在事件中加入一个标志就可以了，更新方法里面判断这个标志来判断是否要更新。

```javascript
Compiler.prototype = {
	// ...
	modelHandler: function (node, scope, exp, prop) {
		if (node.tagName.toLowerCase() === 'input') {
			this.bindWatcher(node, scope, exp, 'value');
			node.addEventListener('input', function (e) {
				node.isInputting = true;   // 由于上面绑定了自动更新，循环依赖了，中文输入法不能用。这里加入一个标志避开自动update
				var newValue = e.target.value;
				scope[exp] = newValue;
			});
		}
	},
	valueUpdater: function (node, newVal) {
		// 当有输入的时候循环依赖了，中文输入法不能用。这里加入一个标志避开自动update
		if (!node.isInputting) {
			node.value = newVal ? newVal : '';
		}
		node.isInputting = false;  // 记得要重置标志
	},
}
```

- if/for指令的懒编译：想象一下if为false的时候你先编译了父元素，然后，然后就没有了！！所以，要先编译子元素，然后编译父元素根据值来判断是否要保留Dom节点。
还有就是指令本身也要在编译完别的指令才编译，否则你节点都没有了，别的指令还怎么编译？当你if为true的时候，没编译的指令就有问题了，所以要最后编译if。
for也是同理，先编译好其他指令，最后只需要克隆一下节点就可以了，不需要反复编译相同的指令。

```javascript
Compiler.prototype = {
	// ...
	compileElementNode: function (node, scope) {
		var attrs = node.attributes;
		var lazyCompileDir = '';
		var lazyCompileExp = '';
		var self = this;
		scope = scope || this.vm;
		[].forEach.call(attrs, function (attr) {
			var dir = checkDirective(attrName);
			if (dir.type) {
				if (dir.type === 'for') {
					lazyCompileDir = dir.type;
					lazyCompileExp = exp;
				} else {
					var handler = self[dir.type + 'Handler'].bind(self);  // 不要漏掉bind(this)，否则其内部this指向会出错
					handler &&	handler(node, scope, exp, dir.prop);
				}
				node.removeAttribute(attrName);
			}
		});
		// if/for懒编译（编译完其他指令后才编译）
		if (lazyCompileExp) {
			this[lazyCompileDir + 'Handler'](node, scope, lazyCompileExp);
		} else {
			this.compile(node, scope);
		}
	},
}
```

3) Compiler里面还有一个比较重要的点就是更新视图方法。
这里说说if指令的更新方法，为了要在指定位置插入节点，我们可以先在该位置加一个占位的textNode，然后将这个textNode传给更新方法，
后续就根据这个占位的textNode进行dom的插删。

```javascript
var updater = {
  dom  : function (node, newVal, nextNode) {
		if (newVal) {
			nextNode.parentNode.insertBefore(node, nextNode);
		} else {
			nextNode.parentNode.removeChild(node);
		}
	}
}
```

## 表达式的求值

先说有意思的部分，然后再做整体介绍吧。

### 1

首先是双大括号文本表达式的解。怎么把 {{propA＋location.href}} connect {{propB.substring(5)}}转成……并求值呢？
     
1.x版本用的是new Function来构造，参数为作用域，然后为内部每个变量增加scope.将其绑定在相应的作用域内。

### 2

这里最重要最有意思的是用来计算表达式的computeExpression这个方法，下文会结合编译器一起介绍。



## Development & Contributing

Using npm install the dependencies:

    $ npm install

Run Gulp

    $ gulp

-------




