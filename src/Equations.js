var mathjs = require("mathjs");
// TODO: n-ary OperatorNode
// TODO: derivative of all mathjs functions

(function(exports) { class Equations {
    constructor (options={}) {
        this.symbolOfExpr = {};
        this.exprOfSymbol = {};
        this.treeOfSymbol = {};
        this.symgen = 0;
        this.symbols = []; // preserve creation order
        this.simplify = options.simplify || this.fastSimplify;
        this.node0 = new mathjs.expression.node.ConstantNode(0);
        this.node1 = new mathjs.expression.node.ConstantNode(1);
        this.nodem1 = new mathjs.expression.node.ConstantNode(-1);
        this.node2 = new mathjs.expression.node.ConstantNode(2);
    }

    generateSymbol() {
        return "_" + this.symgen++;
    }

    bindNode(symbol, node) {
        this.treeOfSymbol[symbol] = node;
        var expr = node.toString();
        this.symbolOfExpr[expr] == null && (this.symbolOfExpr[expr] = symbol);
        this.exprOfSymbol[symbol] = expr;
        this.symbols.push(symbol);
        return symbol;
    }

    fastSimplify(node) { // over 200x faster than mathjs.simplify
        if (node.isOperatorNode) {
            var a0 = this.fastSimplify(node.args[0]);
            var a1 = node.args[1] && this.fastSimplify(node.args[1]);
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
                    if (a1) {
                        return a1.isConstantNode 
                            ? new mathjs.expression.node.ConstantNode(-Number(a1.value))
                            : new mathjs.expression.node.OperatorNode("-", "unaryMinus", [a1]);
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
                    return this.node0;
                }
                if (a1.isConstantNode && a1.value === "0") {
                    return this.node0;
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
                    return this.node0;
                }
                return new mathjs.expression.node.OperatorNode(node.op, node.fn, [a0, a1]);
            } else if (node.op === "^") {
                if (a1.isConstantNode && a1.value === "0") {
                    return this.node1;
                }
                if (a1.isConstantNode && a1.value === "1") {
                    return a0;
                }
                return new mathjs.expression.node.OperatorNode(node.op, node.fn, [a0, a1]);
            } 
        } else if (node.isParenthesisNode) {
            var c = this.fastSimplify(node.content);
            if (c.isParenthesisNode || c.isSymbolNode || c.isConstantNode) {
                return c;
            }
            return new mathjs.expression.node.ParenthesisNode(c);
        } else if (node.isFunctionNode) {
            var args = node.args.map((arg) => this.fastSimplify(arg));
            if (args.length === 1) {
                if (args[0].isParenthesisNode) {
                    args[0] = args[0].content;
                }
            }
            return new mathjs.expression.node.FunctionNode(node.name, args);
        }
        return node;
    }

    derivative(expr, variable="x") {
        if (typeof variable !== "string") {
            throw new Error("derivative(expr, variable) requires a string variable");
        }
        if (expr instanceof Array) {
            return expr.map((e) => this.derivative(e, variable));
        }

        var exprTree = mathjs.parse(expr);
        var symbol = this.digestNode(exprTree);
        var dsymbol = symbol + "_d" + variable;
        var dexpr = this.exprOfSymbol[dsymbol];

        if (dexpr == null) {
            var node = this.treeOfSymbol[symbol];
            if (node == null) {
                if (exprTree.isSymbolNode) {
                    return variable === expr ? "1" : "0"; 
                }
                throw new Error("Unknown symbol:" + symbol);
            }
            var dnode = this.nodeDerivative(node, variable);
            dnode = this.fastSimplify(dnode);
            dexpr = dnode.toString();
            var dexprSymbol = this.digestNormalizedExpr(dexpr);
            this.exprOfSymbol[dsymbol] = dexprSymbol;
            this.symbols.push(dsymbol);
            this.treeOfSymbol[dsymbol] = this.symbolNode(dexprSymbol); 
        }

        return dsymbol;
    }

    symbolNode(symbol) {
        if (symbol === "0") {
            return this.node0;
        } else if (symbol === "1") {
            return this.node1;
        }

        return new mathjs.expression.node.SymbolNode(symbol);
    }

    nodeDerivative(node, variable) {
        var dnode = null;
        var msg = "";
        if (node.isConstantNode) {
            dnode = this.node0;
        } else if (node.isSymbolNode) {
            if (node.name === variable) {
                dnode = this.node1;
            } else if (this.exprOfSymbol[node.name]) {
                var dname = this.derivative(node.name, variable);
                dnode = this.symbolNode(dname);
            } else {
                dnode = this.node0;
            }
        } else if (node.isParenthesisNode) {
            dnode = new mathjs.expression.node.ParenthesisNode(
                this.nodeDerivative(node.content, variable));
        } else if (node.isOperatorNode) {
            var a0 = node.args[0];
            var a1 = node.args[1];
            var da0 = this.nodeDerivative(a0, variable);
            var da1 = a1 && this.nodeDerivative(a1, variable);
            msg = node.op;
            if (node.op === "+") {
                if (node.args[0].isConstantNode) {
                    dnode = da1;
                } else if (a1.isConstantNode) {
                    dnode = da0;
                } else {
                    dnode = new mathjs.expression.node.OperatorNode(node.op, node.fn, [da0,da1]);
                }
            } else if (node.op === "-") {
                if (a1 == null) {
                    dnode = new mathjs.expression.node.OperatorNode(node.op, node.fn, [da0]);
                } else if (a1.isConstantNode) {
                    dnode = da0;
                } else {
                    dnode = new mathjs.expression.node.OperatorNode(node.op, node.fn, [da0,da1]);
                }
            } else if (node.op === "*") { // udv+vdu
                var vdu = new mathjs.expression.node.OperatorNode(node.op, node.fn, [a1, da0]);
                var udv = new mathjs.expression.node.OperatorNode(node.op, node.fn, [a0, da1]);
                dnode = new mathjs.expression.node.OperatorNode("+", "add", [udv, vdu]);
            } else if (node.op === "/") { // d(u/v) = (vdu-udv)/v^2
                var vdu = new mathjs.expression.node.OperatorNode("*", "multiply", [a1, da0]);
                var udv = new mathjs.expression.node.OperatorNode("*", "multiply", [a0, da1]);
                var vduudv = new mathjs.expression.node.OperatorNode("-", "subtract", [vdu, udv]);
                var vv = new mathjs.expression.node.OperatorNode("^", "pos", [a1,this.node2]);
                var vvname = this.digestNormalizedExpr(vv.toString());
                var vvn = this.symbolNode(vvname);
                dnode = new mathjs.expression.node.OperatorNode("/", "divide", [vduudv, vvn]);
            } else if (node.op === "^") { // udv+vdu
                var exponent = a1;
                var dexponent = da1;
                if (exponent.isSymbolNode) {
                    var symNode = this.treeOfSymbol[exponent.name];
                    exponent = symNode || exponent;
                }
                if (exponent != a1) {
                    dexponent = this.nodeDerivative(exponent, variable);
                }
                if (exponent.isConstantNode) {
                    var power = new mathjs.expression.node.ConstantNode(Number(exponent.value)-1);
                    var a0p = new mathjs.expression.node.OperatorNode("^", "pow", [a0,power]);
                    var prod = new mathjs.expression.node.OperatorNode("*", "multiply", [exponent,a0p]);
                    var prodn = this.digestNormalizedExpr(prod.toString());
                    var prodnn = this.symbolNode(prodn);
                    dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [prodnn, da0]);
                } else { // d(u^v) = (u^v)*dv*ln(u) + (u^(g-1))*vdu
                    var uv = node;
                    var u = a0;
                    var v = a1;
                    var dv = da1;
                    var du = da0;
                    var lnu = new mathjs.expression.node.FunctionNode("ln", [u]);
                    var dvlnu = new mathjs.expression.node.OperatorNode("*", "multiply", [dv, lnu]);
                    var uvdvlnu = new mathjs.expression.node.OperatorNode("*", "multiply", [uv, dvlnu]);
                    var v1 = new mathjs.expression.node.OperatorNode("-", "subtract", [v,this.node1]);
                    var uv1 = new mathjs.expression.node.OperatorNode("^", "pow", [u,v1]);
                    var vdu = new mathjs.expression.node.OperatorNode("*", "multiply", [v, du]);
                    var uv1vdu = new mathjs.expression.node.OperatorNode("*", "multiply", [uv1, vdu]);
                    dnode = new mathjs.expression.node.OperatorNode("+", "add", [uvdvlnu, uv1vdu]);
                }
            }
        } else if (node.isFunctionNode) {
            var a0 = node.args[0];
            var da0 = a0 && this.nodeDerivative(a0, variable);
            var a1 = node.args[1];
            var da1 = a1 && this.nodeDerivative(a1, variable);
            if (node.name === "sin") {
                var cos = new mathjs.expression.node.FunctionNode("cos", [a0]);
                var fcos = this.digestNormalizedExpr(cos.toString());
                var fcosn = this.symbolNode(fcos);
                dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [fcosn, da0]);
            } else if (node.name === "cos") {
                var cos = new mathjs.expression.node.FunctionNode("sin", [a0]);
                var fcos = this.digestNormalizedExpr(cos.toString());
                var fcosn = this.symbolNode(fcos);
                var dcos = new mathjs.expression.node.OperatorNode("-", "unaryMinus", [fcosn]);
                dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [dcos, da0]);
            } else if (node.name === "tan") {
                var sec = new mathjs.expression.node.FunctionNode("sec", [a0]);
                var sec2 = new mathjs.expression.node.OperatorNode("^", "pow", [sec, this.node2]);
                var fsec2 = this.digestNormalizedExpr(sec2.toString());
                var fsec2n = this.symbolNode(fsec2);
                dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [fsec2n, da0]);
            } else if (node.name === "sinh") {
                var cosh = new mathjs.expression.node.FunctionNode("cosh", [a0]);
                var fcosh = this.digestNormalizedExpr(cosh.toString());
                var fcoshn = this.symbolNode(fcosh);
                dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [fcoshn, da0]);
            } else if (node.name === "cosh") {
                var sinh = new mathjs.expression.node.FunctionNode("sinh", [a0]);
                var fsinh= this.digestNormalizedExpr(sinh.toString());
                var fsinhn = this.symbolNode(fsinh);
                dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [fsinhn, da0]);
            } else if (node.name === "tanh") {
                var sech = new mathjs.expression.node.FunctionNode("sech", [a0]);
                var sech2 = new mathjs.expression.node.OperatorNode("^", "pow", [sech, this.node2]);
                var fsech2 = this.digestNormalizedExpr(sech2.toString());
                var fsech2n = this.symbolNode(fsech2);
                dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [fsech2n, da0]);
            } else if (node.name === "sqrt") {
                var k = new mathjs.expression.node.ConstantNode(1/2);
                var power = new mathjs.expression.node.ConstantNode(1/2-1);
                var a0p = new mathjs.expression.node.OperatorNode("^", "pow", [a0,power]);
                var prod = new mathjs.expression.node.OperatorNode("*", "multiply", [k,a0p]);
                var prodn = this.digestNormalizedExpr(prod.toString());
                var prodnn = this.symbolNode(prodn);
                dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [prodnn, da0]);
            } else if (node.name === "exp") { // d(exp(g)) = d(g) * exp(g)
                dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [da0, a0]);
            } else {
                throw new Error("TBD derivative(" +node.name+ ")");
            }
        }
        if (dnode == null) {
            throw new Error("nodeDerivative does not support: " + node.type + " " + msg);
        }
        return dnode;
    }

    digestNode(node) {
        var result = null;
        if (node.isConstantNode) {
            result = node.value;
        } else if (node.isSymbolNode) {
            result = node.name;
        } else if (node.isOperatorNode) {
            if (node.args.length === 1) {
                result = this.digestNormalizedExpr("-" + this.digestNode(node.args[0]));
            } else if (node.args.length > 1) {
                var args = node.args.map((arg) => this.digestNode(arg));
                var expr = args.join(" " + node.op + " ");
                result = this.digestNormalizedExpr(expr);
            } else {
                throw new Error("TBD OperatorNode with args:" + node.args.length);
            }
        } else if (node.isFunctionNode) {
            var args = node.args.map((arg) => this.digestNode(arg));
            result = this.digestNormalizedExpr(node.name + "(" + args.join(",") + ")");
        } else if (node.isParenthesisNode) {
            var content = this.digestNode(node.content);
            result = this.digestNormalizedExpr(content.toString());
        } else {
            throw new Error("TBD digestNode("+node.type+")");
        }

        if (typeof result !== "string") {
            throw new Error("DEBUG intenal" + node.type );
        }
        return result;
    }

    digestNormalizedExpr(normalizedExpr) {
        var symbol = this.symbolOfExpr[normalizedExpr];
        if (symbol == null) {
            var digestedNode = mathjs.parse(normalizedExpr);
            if (digestedNode.isConstantNode) {
                return digestedNode.value; // constants are literals
            } else if (digestedNode.isSymbolNode && digestedNode.name[0] === '_') {
                return digestedNode.name; // generated symbol
            }
            symbol = this.generateSymbol();
            this.bindNode(symbol, digestedNode);
        }
        return symbol;
    }

    undigestNode(node) {
        if (node.isConstantNode) {
            return node;
        } else if (node.isSymbolNode) {
            var tree = this.treeOfSymbol[node.name];
            return node.name[0] === "_" && this.undigestNode(tree) || node;
        } else if (node.isOperatorNode) {
            return new mathjs.expression.node.OperatorNode(node.op, node.fn, 
                node.args.map((n) => this.undigestNode(n))
            );
        } else if (node.isFunctionNode) {
            return new mathjs.expression.node.FunctionNode(node.name,
                node.args.map((n) => this.undigestNode(n))
            );
        } else if (node.isParenthesisNode) {
            return new mathjs.expression.node.ParenthesisNode(this.undigestNode(node.content));
        } else {
            throw new Error("TBD undigest"+node.toString()+" "+node.type);
        }
    }

    set(symbol, expr) {
        (typeof expr === "number") && (expr = "" + expr);
        if (typeof symbol !== "string") {
            throw new Error("Invalid call to set(symbol, expr) => symbol must be string");
        }
        if (typeof expr !== "string") {
            throw new Error("Invalid call to set(\""+symbol+"\", expr) => expr must be string");
        }
        var tree = mathjs.parse(expr);
        if (tree.isConstantNode) {
            this.bindNode(symbol, tree);
        } else {
            var digestedSym = this.digestNode(tree);
            this.bindNode(symbol, new mathjs.expression.node.SymbolNode(digestedSym));
        }
        return symbol;
    }

    get(symbol) {
        var node = this.treeOfSymbol[symbol];
        if (node == null) {
            return symbol; // undefined symbol is just itself
        }
        var tree = this.undigestNode(node);
        tree = this.simplify(tree);
        if (!tree) {
            throw new Error("undigest(" +symbol+ ") failed:");
        }
        return this.simplify(tree).toString();
    }

    compile() {
        var body = "";
        var isConstant = (name) => '0' <= name[0] && name[0] <= '9' || name[0] === '-';
        this.symbols.forEach((symbol) => { if (!isConstant(symbol)) {
            var tree = this.treeOfSymbol[symbol].cloneDeep(); 
            tree = tree.transform((node, path, parent) => {
                if (node.isSymbolNode) {
                    if (!isConstant(node.name)) {
                        node.name = "$." + node.name;
                    }
                } else if (node.isFunctionNode) {
                    node.fn.name = "math." + node.fn.name;
                } else if (node.isOperatorNode && node.op === "^") { // Javascript doesn't have "^"
                    return new mathjs.expression.node.FunctionNode("math.pow", node.args);
                }
                return node;
            });
            body += "\n  $." + symbol + " = " + tree.toString() + ";";
        }});
        body += "\n  return $;\n";
        // use Function to create a function with "math" in its lexical environment
        return (new Function("math", "return function($) {" + body + "}"))(mathjs);
    }

} // CLASS

    module.exports = exports.Equations = Equations;
})(typeof exports === "object" ? exports : (exports = {}));

