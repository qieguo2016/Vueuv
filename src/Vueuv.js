/**
 * @authors     : qieguo
 * @date        : 2016/12/15
 * @version     : 1.0
 * @description : Vueuv，框架主体与入口，各个模块的容器，data/method/computed等的代理。
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
