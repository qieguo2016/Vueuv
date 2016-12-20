/**
 * @authors     : qieguo
 * @date        : 2016/12/15
 * @version     : 1.0
 * @description : 表达式的依赖列表
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