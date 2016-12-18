/**
 * @authors     : qieguo
 * @date        : 2016/12/15
 * @version     : 1.0
 * @description : Watcher，订阅Observer的变更消息，获取最新值计算表达式，通过回调函数（updater函数）将计算结果更新到视图上
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