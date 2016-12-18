/**
 * @authors     : qieguo
 * @date        : 2016/12/13
 * @version     : 1.0
 * @description : Observer，实现对viewModel的监控，当发生变更时发出变更消息
 */

function Observer(data) {
	this.data = data;
	this.observe(data);
}

// Observer //@todo 未对数组监控，可以劫持Array的原型实现
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
			// 由于需要在闭包内添加watcher，所以通过Dep定义一个全局target属性，暂存watcher, 添加完移除
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