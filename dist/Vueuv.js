/**
 * @authors     : qieguo
 * @date        : 2016/12/15
 * @version     : 1.0
 * @description : 一个Vue风格的轻量MVVM框架
 */

(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
		typeof define === 'function' && define.amd ? define(factory) :
			(global.Vueuv = factory());
}(this, function () {

	/**
	 * Vueuv, 框架入口，各个模块的容器，data的代理。
	 */
	function Vueuv(options) {
		this.$data = options.data || {};
		this.$el = typeof options.el === 'string'
			? document.querySelector(options.el)
			: options.el || document.body;
		this.$options = options;
		this.window = window;	  // 为了exp中全局对象（Math、location等）的计算取值

		// 代理属性，直接用vm.props访问data、method、computed内数据/方法
		this._proxy(options);
		this._proxyMethods(options.methods);   // method不劫持getter/setter

		var ob = new Observer(this.$data);

		if (!ob) return;
		new Compiler({el: this.$el, vm: this});
	}

	Vueuv.prototype = {
		// 代理属性，直接用vm.props访问data、computed内数据/方法
		_proxy       : function (data) {
			var self = this;
			var proxy = ['data', 'computed'];
			proxy.forEach(function (item) {
				Object.keys(data[item]).forEach(function (key) {
					Object.defineProperty(self, key, {
						configurable: false,
						enumerable  : true,
						get         : function () {
							// 注意不要返回与或表达式，会因类型转换导致出错
							// return self.$data[key] || ((typeof self.$options.computed[key] !== 'undefined') && self.$options.computed[key].call(self));
							if (typeof self.$data[key] !== 'undefined') {
								return self.$data[key];
							} else if (typeof self.$options.computed[key] !== 'undefined') {
								return self.$options.computed[key].call(self);
							} else {
								return undefined;
							}
						},
						set         : function (newVal) {
							if (self.$data.hasOwnProperty(key)) {
								self.$data[key] = newVal;
							} else if (self.$options.computed.hasOwnProperty(key)) {
								self.$options.computed[key] = newVal;
							}
						}
					});
				})
			})
		},
		// method不劫持getter/setter，直接引用
		_proxyMethods: function (methods) {
			var self = this;
			Object.keys(methods).forEach(function (key) {
				self[key] = self.$options.methods[key];
			})
		}
	};

	/**
	 * Compiler，实现对模板的编译，提取指令并将vm与视图关联起来
	 */
	function Compiler(options) {
		// create node
		this.$el = options.el;

		// save viewModel
		this.vm = options.vm;

		// to documentFragment
		if (this.$el) {
			this.$fragment = nodeToFragment(this.$el);
			this.compile(this.$fragment);
			this.$el.appendChild(this.$fragment);
		}
	}

	Compiler.prototype = {

		// 编译主体，遍历子元素
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

		// 编译文本元素，解析表达式
		compileTextNode: function (node, scope) {
			var text = node.textContent.trim();
			if (!text) {
				return;
			}
			var exp = parseTextExp(text);
			scope = scope || this.vm;
			this.textHandler(node, scope, exp);
		},

		// 编译节点元素，调用相应的指令处理方法或者调用compile继续编译
		compileElementNode: function (node, scope) {
			var attrs = node.attributes;
			var lazyCompileDir = '';
			var lazyCompileExp = '';
			var self = this;
			scope = scope || this.vm;
			[].forEach.call(attrs, function (attr) {
				var attrName = attr.name;
				var exp = attr.value;
				var dir = checkDirective(attrName);
				if (dir.type) {
					if (dir.type === 'for') {
						lazyCompileDir = dir.type;
						lazyCompileExp = exp;
					} else {
						var handler = self[dir.type + 'Handler'].bind(self);  // 不要漏掉bind(this)，否则其内部this指向会出错
						if (handler) {
							handler(node, scope, exp, dir.prop);
						} else {
							console.error('找不到' + dir.type + '指令');
						}
						// self[dir.type + 'Handler'] && self[dir.type + 'Handler'](node, scope, exp, dir.prop);
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

		// 绑定监听者
		bindWatcher: function (node, scope, exp, dir, prop) {
			//添加一个Watcher，监听exp相关的所有字段变化
			var updateFn = updater[dir];
			var watcher = new Watcher(exp, scope, function (newVal) {
				updateFn && updateFn(node, newVal, prop);
			});
		},

		/**
		 * 指令处理，指令主要有：
		 * v-text： 表达式编译 @done
		 * v-model：数据视图双向绑定 @done
		 * v-on：事件绑定 @done
		 * v-bind：控制属性
		 * v-show：控制可视化属性，可归在v-bind内
		 * v-if、v-for、v-else（暂不做）：控制流，根据当前值会对子元素造成影响：
		 * v-html： html编译，要做一定的xss拦截
		 * v-pre、v-cloak、v-once：控制不编译、保持内容不变，单次编译暂时不做：
		 * */

		// 绑定事件，v-on:click="handler"
		onHandler: function (node, scope, exp, eventType) {
			var fn = scope[exp];
			if (eventType && fn) {
				node.addEventListener(eventType, fn.bind(scope));  // bind生成一个绑定this的新函数，而call和apply只是调用
			}
		},

		// model双向绑定，v-model="expression"
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

		// html指令 v-html="expression" @FIXME 变更需要重新编译子元素
		htmlHandler: function (node, scope, exp, prop) {
			this.bindWatcher(node, scope, exp, 'html');
		},

		// text指令 v-text="expression"
		textHandler: function (node, scope, exp, prop) {
			this.bindWatcher(node, scope, exp, 'text');
		},

		// show指令 v-show="expression"
		showHandler: function (node, scope, exp, prop) {
			this.bindWatcher(node, scope, exp, 'style', 'display')
		},

		// if指令 v-if="expression"
		ifHandler: function (node, scope, exp, prop) {
			// 先编译子元素，然后根据表达式决定是否插入dom中
			// PS：这里需要先插入一个占位元素来定位，不能依赖其他元素，万一其他元素没了呢？
			this.compile(node, scope);
			var refNode = document.createTextNode('');
			node.parentNode.insertBefore(refNode, node);
			var current = node.parentNode.removeChild(node);
			this.bindWatcher(current, scope, exp, 'dom', refNode); // refNode是引用关系，移动到parentNode后会自动更新位置，所以可以传入
		},

		// 属性指令 v-bind:id="id", v-bind:class="cls"
		bindHandler: function (node, scope, exp, attr) {
			switch (attr) {
				case 'class':
					// 拼成 "baseCls "+(a?"acls ":"")+(b?"bcls ":"")的形式
					exp = '"' + node.className + ' "+' + parseClassExp(exp);
					break;
				case 'style':
					// style可以使用style.cssText/node.setAttribute('style','your style')全量更新，也可以使用style.prop单个更新
					// 全量更新只需要监听全量表达式即可，但是初次编译之后其他地方脚本改了propB的话，下一次更新propA也会使用vm的值去覆盖更改后的propB
					// 单个更新的话需要监听多个值，但是不同样式之间无影响，比如初次编译后脚本更改了propC，下一次更新propB是不会影响到propC的
					// 这里使用全量更新，样式写法是这样的：<div v-bind:style="{ color: activeColor, font-size: fontSize }"></div>
					var styleStr = node.getAttribute('style');
					exp = '"' + styleStr + ';"+' + parseStyleExp(exp);
					break;
				default:

			}
			this.bindWatcher(node, scope, exp, 'attr', attr)
		},

		// 列表指令 v-for="item in items"
		forHandler: function (node, scope, exp, prop) {
			var self = this;
			var itemName = exp.split('in')[0].replace(/\s/g, '')
			var arrNames = exp.split('in')[1].replace(/\s/g, '').split('.');
			var arr = scope[arrNames[0]];
			if (arrNames.length === 2) {
				arr = arr[arrNames[1]];
			}
			var parentNode = node.parentNode;
			arr.forEach(function (item) {
				var cloneNode = node.cloneNode(true);
				parentNode.insertBefore(cloneNode, node);
				var forScope = Object.create(scope);  // 注意每次循环要生成一个新对象
				forScope[itemName] = item;
				self.compile(cloneNode, forScope);  // @FIXME 同样的编译应该有缓存机制
			});
			parentNode.removeChild(node);   // 去掉原始模板
		},
	};

	// 复制节点到文档碎片
	function nodeToFragment(node) {
		var fragment = document.createDocumentFragment(), child;
		while (child = node.firstChild) {
			if (isIgnorable(child)) {     // delete '\n'
				node.removeChild(child);
			} else {
				fragment.appendChild(child);   // 移动操作，将child从原位置移动添加到fragment
			}
		}
		return fragment;
	}

	// 忽略注释节点和换行节点
	function isIgnorable(node) {
		// ignore comment node || a text node
		var regIgnorable = /^[\t\n\r]+/;
		return (node.nodeType == 8) || ((node.nodeType == 3) && (regIgnorable.test(node.textContent)));
	}

	// 检查属性，返回指令类型
	function checkDirective(attrName) {
		var dir = {};
		if (attrName.indexOf('v-') === 0) {
			var parse = attrName.substring(2).split(':');
			dir.type = parse[0];
			dir.prop = parse[1];
		}
		return dir;
	}

	// 解析文本表达式 @todo 未包含pipe语法
	function parseTextExp(text) {
		var regText = /\{\{(.+?)\}\}/g;
		var pieces = text.split(regText);
		var matches = text.match(regText);
		// 文本节点转化为常量和变量的组合表达式，PS：表达式中的空格不管，其他空格要保留
		// 'a {{b+"text"}} c {{d+Math.PI}}' => '"a " + b + "text" + " c" + d + Math.PI'
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

	// 解析class表达式，@todo 目前未写数组语法
	// <div class="static" v-bind:class="{ active: isActive, 'text-danger': hasError }"> </div>
	function parseClassExp(exp) {
		if (!exp) {
			return;
		}
		var regObj = /\{(.+?)\}/g;
		var regArr = /\[(.+?)\]/g;
		var result = [];
		if (regObj.test(exp)) {
			var subExp = exp.replace(/[\s\{\}]/g, '').split(',');
			subExp.forEach(function (sub) {
				var key = '"' + sub.split(':')[0].replace(/['"`]/g, '') + ' "';
				var value = sub.split(':')[1];
				result.push('((' + value + ')?' + key + ':"")')
			});
		} else if (regArr.test(exp)) {
			var subExp = exp.replace(/[\s\[\]]/g, '').split(',');
		}
		return result.join('+');  // 拼成 (a?"acls ":"")+(b?"bcls ":"")的形式
	}

	// 解析style表达式 @todo 目前未写数组语法
	// <div v-bind:style="{ color: activeColor, font-size: fontSize }"></div>
	function parseStyleExp(exp) {
		if (!exp) {
			return;
		}
		var regObj = /\{(.+?)\}/g;
		var regArr = /\[(.+?)\]/g;
		var result = [];
		if (regObj.test(exp)) {
			var subExp = exp.replace(/[\s\{\}]/g, '').split(',');
			subExp.forEach(function (sub) {
				// "color:"activeColor;"font-size:"fontSize;
				var key = '"' + sub.split(':')[0].replace(/['"`]/g, '') + ':"+';
				var value = sub.split(':')[1];
				result.push(key + value + '+";"');
			});
		} else if (regArr.test(exp)) {
			var subExp = exp.replace(/[\s\[\]]/g, '').split(',');
		}
		return result.join('+');  // 拼成 (a?"acls ":"")+(b?"bcls ":"")的形式
	}

	var updater = {
		text : function (node, newVal) {
			node.textContent = typeof newVal === 'undefined' ? '' : newVal;
		},
		html : function (node, newVal) {
			node.innerHTML = typeof newVal == 'undefined' ? '' : newVal;
		},
		value: function (node, newVal) {
			// 当有输入的时候循环依赖了，中文输入法不能用。这里加入一个标志避开自动update
			if (!node.isInputting) {
				node.value = newVal ? newVal : '';
			}
			node.isInputting = false;  // 记得要重置标志
		},
		attr : function (node, newVal, attrName) {
			newVal = typeof newVal === 'undefined' ? '' : newVal;
			node.setAttribute(attrName, newVal);
		},
		style: function (node, newVal, attrName) {
			newVal = typeof newVal === 'undefined' ? '' : newVal;
			if (attrName === 'display') {
				newVal = newVal ? 'initial' : 'none';
			}
			node.style[attrName] = newVal;
		},
		dom  : function (node, newVal, nextNode) {
			if (newVal) {
				nextNode.parentNode.insertBefore(node, nextNode);
			} else {
				nextNode.parentNode.removeChild(node);
			}
		}
	};

	/**
	 * Depedence，变量的监视依赖链
	 */
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

	/**
	 * Observer，实现对viewModel的监控，当发生变更时发出变更消息
	 */
	function Observer(data) {
		this.data = data;
		this.observe(data);
	}

	Observer.prototype.observe = function (data) {
		var self = this;
		// 设置开始和递归终止条件
		if (!data || typeof data !== 'object') {
			return;
		}
		Object.keys(data).forEach(function (key) {
			self.defineReactive(data, key, data[key]);
		});
	}

	Observer.prototype.defineReactive = function (data, key, val) {
		var dep = new Dep();
		var self = this;
		self.observe(val);   // 递归对象属性到基本类型为止
		Object.defineProperty(data, key, {
			enumerable  : true,    // 枚举
			configurable: false, // 不可再配置
			get         : function () {
				// console.log('getter dep', dep);
				// 由于需要在闭包内添加watcher，所以通过Dep定义一个全局target属性，暂存watcher, 添加完移除
				Dep.target && dep.addSub(Dep.target);
				return val;
			},
			set         : function (newVal) {
				if (val === newVal) {
					return;
				}
				// console.log('setter dep', dep);
				val = newVal;  // setter本身已经做了赋值，val作为一个闭包变量，保存最新值
				self.observe(newVal);
				dep.notify();  // 触发通知
			},
		})
	}

	/**
	 * Watcher，订阅Observer的变更消息，获取最新值计算表达式，通过回调函数（updater函数）将计算结果更新到视图上
	 */
	var $uid = 0;

	function Watcher(exp, scope, callback) {
		this.exp = exp;
		this.scope = scope;
		this.callback = callback || function () {};

		//初始化时，触发添加到监听队列
		this.value = null;
		this.uid = $uid++;
		this.update();
	}

	// 解析表达式 with+eval会将表达式中的变量绑定到vm模型中，从而实现对变量的取值，
	function computeExpression(exp, scope) {
		try {
			with (scope) {
				return eval(exp);
			}
		} catch (e) {
			console.error('ERROR', e);
		}

		// with (scope) {
		//   return eval(exp);
		// }

	}

	Watcher.prototype = {
		get   : function () {
			Dep.target = this;
			var value = computeExpression(this.exp, this.scope);  //执行的时候添加监听
			//在parseExpression的时候，with + eval会将表达式中的变量绑定到vm模型中，在求值的时候会调用相应变量的getter事件。
			//由于设置了Dep.target，所以会执行observer的add.sub方法，从而创建了一个依赖链。
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

	return Vueuv;
}));

