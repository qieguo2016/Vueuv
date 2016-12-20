/**
 * @authors     : qieguo
 * @date        : 2016/12/20
 * @version     : 1.0
 * @description : 工具函数
 */

'use strict';

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
function fullCopy(from) {
	var r;
	if (isObject(from)) {
		r = JSON.parse(JSON.stringify(from));
	} else {
		r = from;
	}
	return r;
}
