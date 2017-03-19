var should = require("should");
var mathjs = require("mathjs");

(function(exports) {

    ////////////////// constructor
    Optimizer = function() {
        var that = this;
        that.findex = 0;
        that.emap = {};
        that.memo = {};
        return that;
    }

    Optimizer.prototype.nodeDerivative = function(node, variable) {
        var that = this;
        var dnode = null;
        var msg = "";
        if (node.isConstantNode) {
            dnode = new mathjs.expression.node.ConstantNode(0);
        } else if (node.isSymbolNode) {
            console.log("name", node.name, variable);
            if (node.name === variable) {
                dnode = new mathjs.expression.node.ConstantNode(1);
            } else {
                dnode = new mathjs.expression.node.ConstantNode(0);
            }
        } else if (node.isParenthesisNode) {
        console.log("()", node.content.type, node.content);
            dnode = new mathjs.expression.node.ParenthesisNode(
                that.nodeDerivative(node.content, variable));
        } else if (node.isOperatorNode) {
            msg = node.op;
            if (node.op === "+") {
                if (node.args[0].isConstantNode) {
                    dnode = that.nodeDerivative(node.args[1], variable);
                } else if (node.args[1].isConstantNode) {
                    dnode = that.nodeDerivative(node.args[0], variable);
                } else if (node.args[0].isSymbolNode && node.args[0].name !== variable) {
                    dnode = that.nodeDerivative(node.args[1], variable);
                } else if (node.args[1].isSymbolNode && node.args[1].name !== variable) {
                    dnode = that.nodeDerivative(node.args[0], variable);
                } else {
                    dnode = new mathjs.expression.node.OperatorNode(node.op, "add", [
                        that.nodeDerivative(node.args[0], variable),
                        that.nodeDerivative(node.args[1], variable),
                    ]);
                }
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
            expr = droot.toString();
            that.memo[dfname] = expr;
        }

        return dfname;
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
        for (var i = 0; i < that.findex; i++) {
            var fname = "f" + i;
            var root = mathjs.parse(that.memo[fname]);
            root = root.transform((node, path, parent) => {
                if (node.isSymbolNode) {
                    node.name = "$." + node.name;
                } else if (node.isFunctionNode) {
                    node.fn.name = "math." + node.fn.name;
                } else if (node.isOperatorNode && node.op === "^") { // Javscript doesn't have "^"
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
