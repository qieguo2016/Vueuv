## Vue MVVM双向绑定实现

这也是mvvm框架的基本模式，模型的变化驱动视图的更新，交互事件驱动模型的变化。
由于原生js直接提供了交互事件的接口，所以各种框架都是监听各种交互时间来实现数据模型的更新；在监听模型变化方面则产生了3种方式：
1) 订阅者发布者模式，backbone、knockout等框架
   使用vm.set('property', value)或者property(value)这些函数的方式实现对数据的读写，从而触发更新事件。
2) 脏检查，angular1.x
   通过$digest()函数遍历watcher（非模型数据，而是一个被监视的带有处理函数的数据集），检查到脏数据的时候触发更新事件。
   通过封装DOM、Http、定时器等交互事件自动调用$digest()，或者用户手动调用$digest()、$apply()来触发脏检查机制。
3) 数据劫持，Vue、Avalon
   通过Object.defineProperty劫持了Object的getter、setter事件，从而直接监听到模型数据的变更，继而触发更新事件。

### 简单粗暴版

Vue通过劫持getter、setter来实现对数据的监听，从而实现数据到视图的自动更新。
按照mvvm模型可以得到一个最简单粗暴的实现：

```html
<h3>Vue mvvm simple model</h3>
<div id="app">
    <h2 v-text="title"></h2>
    <p v-text="name"></p>
    <input v-model="name">
</div>
```

```javascript
function Vue(opt) {
  this.data = opt.data || {};
  this.$el = document.querySelector(opt.el) || document.body;
  var textDom = this.$el.querySelectorAll('[v-text]');
  var modelDom = this.$el.querySelectorAll('[v-model]');
  var self = this;

  function observe(data) {
    // 设置开始和递归终止条件
    if (!data || typeof data !== 'object') {
      return;
    }
    // 不能直接使用for循环，避开闭包陷阱
    Object.keys(data).forEach(function (key) {
      defineReactive(data, key, data[key]);
    })
  }

  function defineReactive(data, key, val) {
    observe(val);   // 递归对象属性到基本类型为止
    Object.defineProperty(data, key, {
      enumerable  : true,    // 枚举
      configurable: false, // 不可再配置
      get         : function () {
        return val;
      },
      set         : function (newVal) {
        if (val === newVal) {
          return;
        }
        val = newVal;  // setter本身已经做了赋值，val作为一个闭包变量，保存最新值
        model2View();
      },
    })
  }

  function model2View() {
    textDom.forEach(function (node) {
      node.innerText = self.data[node.getAttribute('v-text')];
    });
  }

  function watch() {
    modelDom.forEach(function (node) {
      node.addEventListener('keyup', function () {
        self.data[node.getAttribute('v-model')] = node.value;
      });
    });
  }

  observe(this.data);
  model2View();
  watch();
}

var vm = new Vue({
  el  : '#app',
  data: {
    name : 'Vue',
    title: 'Hello Vue!',
  },
});
```

上面例子比较粗糙，主要问题有：
1) 直接对绑定的节点进行全量更新，比较浪费性能；
2) 直接使用选择器来选定节点也不够灵活，需要专门定义一个编译函数来编译模板。
3) 对数据的更新也只是单纯的赋值，而在实际应用中我们也经常会用到如v-text="'hello '+name"的表达式，所以也要支持表达式绑定；

上面例子也完全没有结构可言，下面按照Observer、Watcher、Compiler的主要结构来进行划分。功能划分：
1） Observer实现对vm的监视
2） Compiler实现对模板的编译，将vm绑定到视图上
3） Watcher连接Observer与Compiler，订阅Observer消息后触发视图更新

另外三大模块内还有dependence、parser、updater等各种小模块。

### Observer

web应用中数据的流动是数据的变更引起相应依赖数据的变更、从而更新相应的视图，所以首先在Observer中增加对数据的依赖追踪。

```javascript
// Observer
function Observer(data) {
  this.data = data;
  this.observe(data);
}

Observer.prototype.observe = function (data) {
  var self = this;
  // 设置开始和递归终止条件
  if (!data || typeof data !== 'object') {
    return;
  }
  // 不能直接使用for循环，避开闭包陷阱
  Object.keys(data).forEach(function (key) {
    self.defineReactive(data, key, data[key]);
  })
}

Observer.prototype.defineReactive = function (data, key, val) {
  var dep = new Dep();
  var self = this;
  self.observe(val);   // 递归对象属性到基本类型为止
  Object.defineProperty(data, key, {
    enumerable  : true,    // 枚举
    configurable: false, // 不可再配置
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
      dep.notify(newVal);  // 触发通知
    },
  })
}

// dependence
var Dep = function () {
  this.subs = {};
};

Dep.prototype.addSub = function (target) {
  if (!this.subs[target.uid]) {  //防止重复添加
    this.subs[target.uid] = target;
  }
};

Dep.prototype.notify = function (newVal) {
  for (var uid in this.subs) {
    this.subs[uid].update(newVal);
  }
};
```

通过Dep.target可以控制是否增加订阅者，而在setter的时候去更新订阅者列表从而出发相应依赖项的更新。

### Compiler

定义专门的Compiler来将DOM节点编译成绑定表达式绑定到视图上。为了提高效率，需要先将目标的DOM节点复制到 documentFragment 中进行遍历编译，完成后再将其挂靠回DOM节点树中。
vue 1.0中的指令解析还是依赖于各种dom方法，这样做的好处是可以充分利用底层函数，降低解析算法的复杂度。
但是另外一方面这种做法却依赖于浏览器环境，无法在本地node环境里面做预编译，另外效率上也有可优化的空间，所以vue 2.0就直接写了一个语法解析器来解析Vue指令。











