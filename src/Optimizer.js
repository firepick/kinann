var should = require("should");
var mathjs = require("mathjs");

(function(exports) {

    ////////////////// constructor
    Optimizer = function() {
        var that = this;
        that.findex = 0;
        that.emap = {};
        that.memo = {};
        that.node0 = new mathjs.expression.node.ConstantNode(0);
        that.node1 = new mathjs.expression.node.ConstantNode(1);
        that.node2 = new mathjs.expression.node.ConstantNode(2);
        return that;
    }

    Optimizer.prototype.nodeDerivative = function(node, variable) {
        var that = this;
        var dnode = null;
        var msg = "";
        if (node.isConstantNode) {
            dnode = new mathjs.expression.node.ConstantNode(0);
        } else if (node.isSymbolNode) {
            if (node.name === variable) {
                dnode = new mathjs.expression.node.ConstantNode(1);
            } else if (that.memo[node.name]) {
                var dname = this.derivative(node.name, variable);
                dnode = new mathjs.expression.node.SymbolNode(dname);
            } else {
                dnode = new mathjs.expression.node.ConstantNode(0);
            }
        } else if (node.isParenthesisNode) {
            dnode = new mathjs.expression.node.ParenthesisNode(
                that.nodeDerivative(node.content, variable));
        } else if (node.isOperatorNode) {
            var a0 = node.args[0];
            var a1 = node.args[1];
            var da0 = that.nodeDerivative(a0, variable);
            var da1 = a1 && that.nodeDerivative(a1, variable);
            msg = node.op;
            if (node.op === "+") {
                if (node.args[0].isConstantNode) {
                    dnode = da1;
                } else if (a1.isConstantNode) {
                    dnode = da0;
                } else if (a0.isSymbolNode && a0.name !== variable) {
                    dnode = da1;
                } else if (a1.isSymbolNode && a1.name !== variable) {
                    dnode = da0;
                } else {
                    dnode = new mathjs.expression.node.OperatorNode(node.op, node.fn, [da0,da1]);
                }
            } else if (node.op === "-") {
                if (a1 == null) {
                    dnode = new mathjs.expression.node.OperatorNode(node.op, node.fn, [da0]);
                } else if (a1.isConstantNode) {
                    dnode = da0;
                } else if (a1.isSymbolNode && a1.name !== variable) {
                    dnode = da0;
                } else {
                    dnode = new mathjs.expression.node.OperatorNode(node.op, node.fn, [da0,da1]);
                }
            } else if (node.op === "*") { // udv+vdu
                var vdu = new mathjs.expression.node.OperatorNode(node.op, node.fn, [a1, da0]);
                var udv = new mathjs.expression.node.OperatorNode(node.op, node.fn, [a0, da1]);
                dnode = new mathjs.expression.node.OperatorNode("+", "add", [udv, vdu]);
            } else if (node.op === "/") { // (vdu-udv)/v^2
                var vdu = new mathjs.expression.node.OperatorNode("*", "multiply", [a1, da0]);
                var udv = new mathjs.expression.node.OperatorNode("*", "multiply", [a0, da1]);
                var udvvdu = new mathjs.expression.node.OperatorNode("-", "subtract", [udv, vdu]);
                var vv = new mathjs.expression.node.OperatorNode("^", "pos", [a1,that.node2]);
                var vvname = that.optimize(vv.toString());
                var vvn = new mathjs.expression.node.SymbolNode(vvname);
                dnode = new mathjs.expression.node.OperatorNode("/", "divide", [udvvdu, vvn]);
            } else if (node.op === "^") { // udv+vdu
                if (a1.isConstantNode) {
                    var k = a1.clone();
                    var power = new mathjs.expression.node.ConstantNode(Number(a1.value)-1);
                    var a0p = new mathjs.expression.node.OperatorNode("^", "pow", [a0,power]);
                    var prod = new mathjs.expression.node.OperatorNode("*", "multiply", [k,a0p]);
                    var prodn = that.optimize(prod.toString());
                    var prodnn = new mathjs.expression.node.SymbolNode(prodn);
                    dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [prodnn, da0]);
                }
                var vdu = new mathjs.expression.node.OperatorNode(node.op, node.fn, [a1, da0]);
                var udv = new mathjs.expression.node.OperatorNode(node.op, node.fn, [a0, da1]);
            }
        } else if (node.isFunctionNode) {
            var a0 = node.args[0];
            var da0 = a0 && that.nodeDerivative(a0, variable);
            var a1 = node.args[1];
            var da1 = a1 && that.nodeDerivative(a1, variable);
            if (node.name === "sin") {
                var cos = new mathjs.expression.node.FunctionNode("cos", [a0]);
                var fcos = that.optimize(cos.toString());
                var fcosn = new mathjs.expression.node.SymbolNode(fcos);
                dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [fcosn, da0]);
            } else if (node.name === "cos") {
                var cos = new mathjs.expression.node.FunctionNode("sin", [a0]);
                var fcos = that.optimize(cos.toString());
                var fcosn = new mathjs.expression.node.SymbolNode(fcos);
                var dcos = new mathjs.expression.node.OperatorNode("-", "unaryMinus", [fcosn]);
                dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [dcos, da0]);
            } else if (node.name === "sqrt") {
                var k = new mathjs.expression.node.ConstantNode(1/2);
                var power = new mathjs.expression.node.ConstantNode(1/2-1);
                var a0p = new mathjs.expression.node.OperatorNode("^", "pow", [a0,power]);
                var prod = new mathjs.expression.node.OperatorNode("*", "multiply", [k,a0p]);
                var prodn = that.optimize(prod.toString());
                var prodnn = new mathjs.expression.node.SymbolNode(prodn);
                dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [prodnn, da0]);
            }
        }
        if (dnode == null) {
            throw new Error("nodeDerivative does not support: " + node.type + " " + msg);
        }
        return dnode;
    }
    Optimizer.prototype.derivative = function(fname, variable) {
        var that = this;
        var dfname = fname + "_d" + variable;
        var dexpr = that.memo[dfname];

        if (dexpr == null) {
            var expr = that.memo[fname];
            if (expr == null) {
                throw new Error("Expected optimized function name:" + fname);
            }
            var root = mathjs.parse(expr);
            var droot = that.nodeDerivative(root, variable);
            droot = that.pruneNode(droot);
            expr = droot.toString();
            that.memo[dfname] = expr;
        }

        return dfname;
    }

    Optimizer.prototype.pruneNode = function(node, parent) {
        var that = this;
        if (node.isOperatorNode) {
            var a0 = that.pruneNode(node.args[0], node);
            var a1 = node.args[1] && that.pruneNode(node.args[1], node);
            if (node.op === "+") {
                if (a0.isConstantNode && a0.value === "0") {
                    return a1;
                }
                if (a1.isConstantNode && a1.value === "0") {
                    return a0;
                }
                return new mathjs.expression.node.OperatorNode(node.op, node.fn, [a0,a1]);
            } else if (node.op === "-") {
                if (a0.isConstantNode && a0.value === "0") {
                    if (a1 && a1.isConstantNode) {
                        return new mathjs.expression.node.ConstantNode(-Number(a1.value));
                    }
                }
                if (node.fn === "subtract") {
                    if (a1.isConstantNode && a1.value === "0") {
                        return a0;
                    }
                    return new mathjs.expression.node.OperatorNode(node.op, node.fn, [a0,a1]);
                } else if (node.fn === "unaryMinus") {
                    return new mathjs.expression.node.OperatorNode(node.op, node.fn, [a0]);
                }
            } else if (node.op === "*") {
                if (a0.isConstantNode && a0.value === "0") {
                    return that.node0;
                }
                if (a1.isConstantNode && a1.value === "0") {
                    return that.node0;
                }
                if (a0.isConstantNode && a0.value === "1") {
                    return a1;
                }
                if (a1.isConstantNode && a1.value === "1") {
                    return a0;
                }
                return new mathjs.expression.node.OperatorNode(node.op, node.fn, [a0, a1]);
            } else if (node.op === "/") {
                if (a0.isConstantNode && a0.value === "0") {
                    return that.node0;
                }
                return new mathjs.expression.node.OperatorNode(node.op, node.fn, [a0, a1]);
            } 
        } else if (node.isParenthesisNode) {
            var c = that.pruneNode(node.content, node);
            if (c.isParenthesisNode || c.isSymbolNode || c.isConstantNode) {
                return c;
            }
            return new mathjs.expression.node.ParenthesisNode(c);
        } else if (node.isFunctionNode) {
            var args = node.args.map((arg) => that.pruneNode(arg, node));
            if (args.length === 1) {
                if (args[0].isParenthesisNode) {
                    args[0] = args[0].content;
                }
            }
            return new mathjs.expression.node.FunctionNode(node.name, args);
        }
        return node;
    }

    Optimizer.prototype.optimize = function(expr) {
        var that = this;
        if (expr instanceof Array) {
            return expr.map((e) => that.optimize(e));
        }
        var root = mathjs.parse(expr);
        var eroot = root.toString();
        var fname = that.emap[eroot];
        if (!fname) {
            var ememo = eroot;
            root.traverse((node, path, parent) => {
                if (node.isParenthesisNode && parent) {
                    var e = node.toString();
                    !that.emap[e] && that.optimize(e);
                } else if (node.isFunctionNode && parent) {
                    var e = node.toString();
                    !that.emap[e] && that.optimize(e);
                }
            });
            for (var i = 0; i < that.findex; i++) { // apply accumulated optimizations
                var fsub = "f" + i;
                var subExpr = that.memo[fsub];
                if (ememo.indexOf(subExpr) >= 0) {
                    if (subExpr[0] === '(') {
                        // retain parenthesis in case of function invocation
                        ememo = ememo.split(subExpr).join("("+fsub+")"); // eliminate parenthesized sub-expression
                    } else if (subExpr.indexOf("(") > 0) {
                        ememo = ememo.split(subExpr).join(fsub); // eliminate duplicate function invocation
                    }
                }
            }
            fname = "f" + that.findex++;
            that.memo[fname] = ememo;
            that.emap[eroot] = fname;
        }

        return fname;
    }

    Optimizer.prototype.compile = function() {
        var that = this;
        var body = "";
        var keys = Object.keys(that.memo).sort((a,b) => (a.length === b.length) ?  
            a.localeCompare(b) : (a.length - b.length));
        for (var i = 0; i < keys.length; i++) {
            var fname = keys[i];
            var root = mathjs.parse(that.memo[fname]);
            root = root.transform((node, path, parent) => {
                if (node.isSymbolNode) {
                    node.name = "$." + node.name;
                } else if (node.isFunctionNode) {
                    node.fn.name = "math." + node.fn.name;
                } else if (node.isOperatorNode && node.op === "^") { // Javascript doesn't have "^"
                    return new mathjs.expression.node.FunctionNode("math.pow", node.args);
                }
                return node;
            });
            body += "\n  $." + fname + " = " + root.toString() + ";";
        }
        body += "\n  return $.f" + (that.findex - 1) + ";\n";
        // use Function to create a function with "math" in its lexical environment
        return (new Function("math", "return function($) {" + body + "}"))(mathjs);
    }

    module.exports = exports.Optimizer = Optimizer;
})(typeof exports === "object" ? exports : (exports = {}));
