/**
 * @authors     : qieguo
 * @date        : 2016/12/20
 * @version     : 1.0
 * @description : 工具函数
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

// 解析表达式 with+eval会将表达式中的变量绑定到vm模型中，从而实现对变量的取值，
function computeExpression(exp, scope) {
	try {
		with (scope) {
			return eval(exp);
		}
	} catch (e) {
		console.error('ERROR', e);
	}
}