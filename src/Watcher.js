/**
 * @authors     : qieguo
 * @date        : 2016/12/15
 * @version     : 1.0
 * @description : Watcher，订阅Observer的变更消息，获取最新值计算表达式，通过回调函数（updater函数）将计算结果更新到视图上
 */

// import computeExpression from util;
// import isEqual from util;
// import isObject from util;
// import deepCopy from util;

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

/**
 * 解析表达式，with+eval会将表达式中的变量绑定到vm模型中，从而实现对表达式的计算
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