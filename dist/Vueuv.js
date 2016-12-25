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
	 * Util/Helper方法，不多就不区分了。
	 */

	/**
	 * 是否相等，包括基础类型和对象/数组的对比
	 */
	function isEqual(a, b) {
		return a == b || (
				isObject(a) && isObject(b)
					? JSON.stringify(a) === JSON.stringify(b)
					: false
			)
	}

	/**
	 * 是否为对象(包括数组、正则等)
	 */
	function isObject(obj) {
		return obj !== null && typeof obj === 'object'
	}

	/**
	 * 复制对象，若为对象则深度复制
	 */
	function deepCopy(from) {
		var r;
		if (isObject(from)) {
			r = JSON.parse(JSON.stringify(from));
		} else {
			r = from;
		}
		return r;
	}

	/**
	 * 解析表达式
	 * with+eval会将表达式中的变量绑定到vm模型中，从而实现对变量的取值
	 * 被compiler和Watcher调用
	 */
	function computeExpression(exp, scope) {
		try {
			with (scope) {
				return eval(exp);
			}
		} catch (e) {
			console.error('ERROR', e);
		}
	}

	// =======================  Utils End  ===================== //


	/**
	 * Compiler，实现对模板的编译，提取指令并将vm与视图关联起来
	 */

	var $$id = 0;

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
			node.$id = $$id++;
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
			var attrs = [].slice.call(node.attributes);  // attributes是动态的，要复制到数组里面去遍历
			var lazyCompileDir = '';
			var lazyCompileExp = '';
			var self = this;
			scope = scope || this.vm;
			attrs.forEach(function (attr) {
				var attrName = attr.name;
				var exp = attr.value;
				var dir = checkDirective(attrName);
				if (dir.type) {
					if (dir.type === 'for' || dir.type === 'if') {
						lazyCompileDir = dir.type;
						lazyCompileExp = exp;
					} else {
						var handler = self[dir.type + 'Handler'].bind(self);  // 不要漏掉bind(this)，否则其内部this指向会出错
						if (handler) {
							handler(node, scope, exp, dir.prop);
						} else {
							console.error('找不到' + dir.type + '指令');
						}
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

		// 绑定事件，三种形式：v-on:click="handler"， v-on:click="add($index)"， v-on:click="count=count+1"
		onHandler: function (node, scope, exp, eventType) {
			if (!eventType) {
				return console.error('绑定方法有误');
			}
			// 函数名
			var fn = scope[exp];
			if (typeof fn === 'function') {
				node.addEventListener(eventType, fn.bind(scope));  // bind生成一个绑定this的新函数，而call和apply只是调用
			} else {
				// 表达式和add(item)，使用computeExpression(exp, scope)
				node.addEventListener(eventType, function () {
					computeExpression(exp, scope);
				});
			}
		},

		/**
		 * model双向绑定，v-model="expression"
		 * 不同的元素绑定的值不同：checkbox、radio绑定的是checked，其他为value
		 * 不同的元素也有不同的处理方式：checkbox处理value数组，其他处理value的单值
		 * */
		modelHandler: function (node, scope, exp, prop) {
			if (node.tagName.toLowerCase() === 'input') {
				switch (node.type) {
					case 'checkbox':
						this.bindWatcher(node, scope, exp, 'checkbox');
						node.addEventListener('change', function (e) {
							var target = e.target;
							var value = target.value || target.$id;
							var index = scope[exp].indexOf(value);
							if (target.checked && index < 0) {
								scope[exp].push(value);
							} else if (!target.checked && index > -1) {
								scope[exp].splice(index, 1);
							}
						});
						break;
					case 'radio':
						this.bindWatcher(node, scope, exp, 'radio');
						node.addEventListener('change', function (e) {
							var target = e.target;
							if (target.checked) {
								var calExp = exp + '=`' + target.value + '`';
								with (scope) {
									eval(calExp);
								}
							}
						});
						break;
					case 'file':
						this.bindWatcher(node, scope, exp, 'value');
						node.addEventListener('change', function (e) {
							var newValue = e.target.value;
							var calExp = exp + '=`' + newValue + '`';
							with (scope) {
								eval(calExp);
							}
						});
						break;
					default:
						this.bindWatcher(node, scope, exp, 'value');
						node.addEventListener('input', function (e) {
							node.isInputting = true;   // 由于上面绑定了自动更新，循环依赖了，中文输入法不能用。这里加入一个标志避开自动update
							var newValue = e.target.value;
							var calExp = exp + '=`' + newValue + '`';
							with (scope) {
								eval(calExp);
							}
						});
				}
			}
		},

		// html指令 v-html="expression"
		htmlHandler: function (node, scope, exp, prop) {
			var updateFn = updater.html;
			var self = this;
			var watcher = new Watcher(exp, scope, function (newVal) {
				updateFn && updateFn(node, newVal, prop);
				self.compile(node, scope);
			});
		},

		// text指令 v-text="expression"
		textHandler: function (node, scope, exp, prop) {
			this.bindWatcher(node, scope, exp, 'text');
		},

		// show指令 v-show="expression"
		showHandler: function (node, scope, exp, prop) {
			this.bindWatcher(node, scope, exp, 'style', 'display')
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

		// 列表指令 v-for="item in items"
		forHandler: function (node, scope, exp, prop) {
			var self = this;
			var itemName = exp.split('in')[0].replace(/\s/g, '')
			var arrNames = exp.split('in')[1].replace(/\s/g, '').split('.');
			var parentNode = node.parentNode;
			var startNode = document.createTextNode('');
			var endNode = document.createTextNode('');
			var range = document.createRange();
			parentNode.replaceChild(endNode, node); // 去掉原始模板
			parentNode.insertBefore(startNode, endNode);
			var watcher = new Watcher(arrNames.join('.'), scope, function (newArray, oldArray, options) {
				// 目前是全量更新，@todo 可以根据options传过来的method和args像操作数组一样操作dom
				range.setStart(startNode, 0);
				range.setEnd(endNode, 0);
				range.deleteContents();
				newArray.forEach(function (item, index) {
					var cloneNode = node.cloneNode(true);
					parentNode.insertBefore(cloneNode, endNode);
					var forScope = Object.create(scope);  // for循环内作用域绑定在当前作用域之下，注意每次循环要生成一个新对象
					forScope.$index = index;   // 增加$index下标
					forScope[itemName] = item;  // 绑定item作用域
					self.compile(cloneNode, forScope);  // @FIXME 同样的编译应该有缓存机制
				});
			});
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
		} else if (attrName.indexOf('@') === 0) {
			dir.type = 'on';
			dir.prop = attrName.substring(1);
		} else if (attrName.indexOf(':') === 0) {
			dir.type = 'bind';
			dir.prop = attrName.substring(1);
		}
		return dir;
	}

	// 解析文本表达式，未包含pipe语法，但是pipe语法其实可以用computed函数实现
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

	/**
	 * 解析class表达式，eg：
	 * <div class="static" v-bind:class="{ active: isActive, 'text-danger': hasError }"></div>
	 * <div v-bind:class="[isActive ? activeClass : '', errorClass]">
	 */
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
			result = subExp.map(function (sub) {
				return '(' + sub + ')' + '+" "';
			});
		}
		return result.join('+');  // 拼成 (a?"acls ":"")+(b?"bcls ":"")的形式
	}

	/**
	 * 解析style表达式 @todo 目前未写单个对象语法和数组语法，eg：
	 * <div v-bind:style="{ color: activeColor, font-size: fontSize }"></div>
	 * <div v-bind:style="[baseStyles, overridingStyles]">
	 */
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
				var key = '"' + sub.split(':')[0].replace(/['"`]/g, '') + ':"+';
				var value = sub.split(':')[1];
				result.push(key + value + '+";"');
			});
		} else if (regArr.test(exp)) {
			var subExp = exp.replace(/[\s\[\]]/g, '').split(',');
			result = subExp.map(function (sub) {
				return '(' + sub + ')' + '+";"';
			});
		}
		return result.join('+');  // 拼成 (a?"acls ":"")+(b?"bcls ":"")的形式
	}

	var updater = {
		text    : function (node, newVal) {
			node.textContent = typeof newVal === 'undefined' ? '' : newVal;
		},
		html    : function (node, newVal) {
			node.innerHTML = typeof newVal == 'undefined' ? '' : newVal;
		},
		value   : function (node, newVal) {
			// 当有输入的时候循环依赖了，中文输入法不能用。这里加入一个标志避开自动update
			if (!node.isInputting) {
				node.value = newVal ? newVal : '';
			}
			node.isInputting = false;  // 记得要重置标志
		},
		checkbox: function (node, newVal) {
			// 处理数组
			var value = node.value || node.$id;
			if (newVal.indexOf(value) < 0) {
				node.checked = false;
			} else {
				node.checked = true;
			}
		},
		attr    : function (node, newVal, attrName) {
			newVal = typeof newVal === 'undefined' ? '' : newVal;
			node.setAttribute(attrName, newVal);
		},
		style   : function (node, newVal, attrName) {
			newVal = typeof newVal === 'undefined' ? '' : newVal;
			if (attrName === 'display') {
				newVal = newVal ? 'initial' : 'none';
			}
			node.style[attrName] = newVal;
		},
		dom     : function (node, newVal, nextNode) {
			if (newVal) {
				nextNode.parentNode.insertBefore(node, nextNode);
			} else {
				nextNode.parentNode.removeChild(node);
			}
		},
	};

	// =======================  Compiler End  ===================== //


	/**
	 * Dependence，表达式的依赖列表
	 */
	function Dep() {
		this.subs = {};
	};

	// 增加订阅者
	Dep.prototype.addSub = function (target) {
		if (!this.subs[target.uid]) {  //防止重复添加
			this.subs[target.uid] = target;
		}
	};

	// 发布消息
	Dep.prototype.notify = function (options) {
		for (var uid in this.subs) {
			this.subs[uid].update(options);
		}
	};

	// =======================  Dependence End  ===================== //


	/**
	 * Observer，实现对viewModel的监视，当发生变更时发出变更消息
	 */
	function Observer(data) {
		this.data = data;
		this.observe(data);
	}

	Observer.prototype = {

		// 监视主控函数
		observe: function (data) {
			var self = this;
			// 设置开始和递归终止条件
			if (!data || typeof data !== 'object') {
				return;
			}
			Object.keys(data).forEach(function (key) {
				self.observeObject(data, key, data[key]);
			});
		},

		// 监视对象，劫持Obect的getter、setter实现
		observeObject: function (data, key, val) {
			var dep = new Dep();   // 每个变量单独一个dependence列表
			var self = this;
			Object.defineProperty(data, key, {
				enumerable  : true,    // 枚举
				configurable: false,   // 不可再配置
				get         : function () {
					// 由于需要在闭包内添加watcher，所以通过Dep定义一个全局target属性，暂存watcher, 添加完移除
					Dep.target && dep.addSub(Dep.target);
					return val;
				},
				set         : function (newVal) {
					if (val === newVal) {
						return;
					}
					val = newVal;  // setter本身已经做了赋值，val作为一个闭包变量，保存最新值
					if (Array.isArray(newVal)) {
						self.observeArray(newVal, dep);  // 递归监视，数组的监视要分开
					} else {
						self.observe(newVal);   // 递归对象属性到基本类型为止
					}
					dep.notify();  // 触发通知
				},
			});
			if (Array.isArray(val)) {
				self.observeArray(val, dep);  // 递归监视，数组的监视要分开
			} else {
				self.observe(val);   // 递归对象属性到基本类型为止
			}
		},

		// 监视数组
		observeArray: function (arr, dep) {
			var self = this;
			arr.__proto__ = self.defineReactiveArray(dep);
			arr.forEach(function (item) {
				self.observe(item);
			});
		},

		// 改写Array的原型实现数组监视
		defineReactiveArray: function (dep) {
			var arrayPrototype = Array.prototype;
			var arrayMethods = Object.create(arrayPrototype);
			var self = this;

			// 重写/定义数组变异方法
			var methods = [
				'pop',
				'push',
				'sort',
				'shift',
				'splice',
				'unshift',
				'reverse'
			];

			methods.forEach(function (method) {
				// 得到单个方法的原型对象，不能直接修改整个Array原型，那是覆盖
				var original = arrayPrototype[method];
				// 给数组方法的原型添加监监视
				Object.defineProperty(arrayMethods, method, {
					value       : function () {
						// 获取函数参数
						var args = [];
						for (var i = 0, l = arguments.length; i < l; i++) {
							args.push(arguments[i]);
						}
						// 数组方法的实现
						var result = original.apply(this, args);
						// 数组插入项
						var inserted
						switch (method) {
							case 'push':
							case 'unshift':
								inserted = args
								break
							case 'splice':
								inserted = args.slice(2)
								break
						}
						// 监视数组插入项，而不是重新监视整个数组
						if (inserted && inserted.length) {
							self.observeArray(inserted, dep)
						}
						// 触发更新
						dep.notify({method, args});
						return result
					},
					enumerable  : true,
					writable    : true,
					configurable: true
				});
			});

			/**
			 * 添加数组选项设置/替换方法（全局修改）
			 * 提供需要修改的数组项下标 index 和新值 value
			 */
			Object.defineProperty(arrayMethods, '$set', {
				value: function (index, value) {
					// 超出数组长度默认追加到最后
					if (index >= this.length) {
						index = this.length;
					}
					return this.splice(index, 1, value)[0];
				}
			});

			/**
			 * 添加数组选项删除方法（全局修改）
			 */
			Object.defineProperty(arrayMethods, '$remove', {
				value: function (item) {
					var index = this.indexOf(item);
					if (index > -1) {
						return this.splice(index, 1);
					}
				}
			});


			return arrayMethods;
		}

	};

	// =======================  Observer End  ===================== //


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

	Watcher.prototype = {
		get   : function () {
			Dep.target = this;
			var value = computeExpression(this.exp, this.scope);  //执行的时候添加监听
			// 在parseExpression的时候，with + eval会将表达式中的变量绑定到vm模型中，在求值的时候会调用相应变量的getter事件。
			// 由于设置了Dep.target，所以会执行observer的add.sub方法，从而创建了一个依赖链。
			Dep.target = null;
			return value;
		},
		update: function (options) {
			var newVal = this.get();
			// 这里有可能是对象/数组，所以不能直接比较，可以借助JSON来转换成字符串对比
			if (!isEqual(this.value, newVal)) {
				this.callback && this.callback(newVal, this.value, options);
				this.value = deepCopy(newVal);
			}
		}
	}

	// =======================  Watcher End  ===================== //


	/**
	 * Vueuv，框架主体与入口，各个模块的容器，data/method/computed等的代理。
	 */
	function Vueuv(options) {
		this.$data = options.data || {};
		this.$el = typeof options.el === 'string'
			? document.querySelector(options.el)
			: options.el || document.body;
		options = Object.assign({},
			{
				computed: {},
				methods : {}
			},
			options);
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
	}

	return Vueuv;
}));

