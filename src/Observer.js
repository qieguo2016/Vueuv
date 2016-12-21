/**
 * @authors     : qieguo
 * @date        : 2016/12/13
 * @version     : 1.0
 * @description : Observer，实现对viewModel的监视，当发生变更时发出变更消息
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