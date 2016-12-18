/**
 * @authors     : qieguo
 * @date        : 2016/12/15
 * @version     : 1.0
 * @description :
 */

// dependence
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