/**
 * Trace Engine (FE 科目B 疑似言語の超簡易対応)
 *
 * genko_kihon.md の「トレースのやり方」前提:
 * - 上から順に実行する
 * - 代入は "現在のメモ(状態)" を参照して評価する
 * - トレース表は「変数の現在値」を更新していく（行番号ごとに作らない）
 *
 * 対応範囲（まずはゲーム用途の最小）:
 * - 整数型: x ← 1  (宣言 + 初期化)
 * - x ← y
 * - x ← y + z / x ← x + 3 / x ← x - 2 / x ← y * 2 / x ← y / 2
 * - 出力行: 「xの値...出力する」から出力変数を抽出
 */
(() => {
  /**
   * @param {string} s
   * @returns {string}
   */
  function normalizeLine(s) {
    return String(s)
      .replace(/\r?\n/g, '')
      .replace(/\u3000/g, ' ') // 全角スペース→半角
      .trim();
  }

  /**
   * @param {string} line
   * @returns {string[]}
   */
  function extractOutputVarNames(line) {
    // 例:
    // - "yの値とzの値をこの順にコンマ区切りで出力する"
    // - "iの値を出力する"
    const names = [];
    const re = /([A-Za-z_][A-Za-z0-9_]*)の値/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      names.push(m[1]);
    }
    return names;
  }

  /**
   * Tokenize expression for a tiny integer expression parser.
   * @param {string} expr
   * @returns {{type:'num', value:number} | {type:'id', value:string} | {type:'op', value:string} | {type:'paren', value:'(' | ')'}[]}
   */
  function tokenize(expr) {
    const s = normalizeLine(expr);
    /** @type {any[]} */
    const out = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === ' ') {
        i++;
        continue;
      }
      if (ch === '(' || ch === ')') {
        out.push({ type: 'paren', value: ch });
        i++;
        continue;
      }
      if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
        out.push({ type: 'op', value: ch });
        i++;
        continue;
      }
      if (/[0-9]/.test(ch)) {
        let j = i + 1;
        while (j < s.length && /[0-9]/.test(s[j])) j++;
        out.push({ type: 'num', value: Number(s.slice(i, j)) });
        i = j;
        continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        let j = i + 1;
        while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
        out.push({ type: 'id', value: s.slice(i, j) });
        i = j;
        continue;
      }
      throw new Error(`式の解析に失敗: 不明な文字 "${ch}" in "${expr}"`);
    }
    return out;
  }

  const PRECEDENCE = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2,
  };

  /**
   * Shunting-yard to RPN for + - * / and parentheses.
   * @param {ReturnType<typeof tokenize>} tokens
   * @returns {ReturnType<typeof tokenize>}
   */
  function toRpn(tokens) {
    /** @type {any[]} */
    const output = [];
    /** @type {any[]} */
    const ops = [];

    for (const t of tokens) {
      if (t.type === 'num' || t.type === 'id') {
        output.push(t);
        continue;
      }
      if (t.type === 'op') {
        while (ops.length > 0) {
          const top = ops[ops.length - 1];
          if (top.type === 'op' && PRECEDENCE[top.value] >= PRECEDENCE[t.value]) {
            output.push(ops.pop());
          } else {
            break;
          }
        }
        ops.push(t);
        continue;
      }
      if (t.type === 'paren' && t.value === '(') {
        ops.push(t);
        continue;
      }
      if (t.type === 'paren' && t.value === ')') {
        while (ops.length > 0 && !(ops[ops.length - 1].type === 'paren' && ops[ops.length - 1].value === '(')) {
          output.push(ops.pop());
        }
        if (ops.length === 0) throw new Error('式の解析に失敗: 括弧が対応していません');
        ops.pop(); // '('
        continue;
      }
      throw new Error(`式の解析に失敗: 不明トークン ${JSON.stringify(t)}`);
    }
    while (ops.length > 0) {
      const t = ops.pop();
      if (t.type === 'paren') throw new Error('式の解析に失敗: 括弧が対応していません');
      output.push(t);
    }
    return output;
  }

  /**
   * @param {string} expr
   * @param {Record<string, number>} env
   * @returns {number}
   */
  function evalExpr(expr, env) {
    const rpn = toRpn(tokenize(expr));
    /** @type {number[]} */
    const st = [];
    for (const t of rpn) {
      if (t.type === 'num') {
        st.push(t.value);
        continue;
      }
      if (t.type === 'id') {
        if (!(t.value in env)) throw new Error(`未定義の変数 "${t.value}" を参照しました`);
        st.push(env[t.value]);
        continue;
      }
      if (t.type === 'op') {
        const b = st.pop();
        const a = st.pop();
        if (a === undefined || b === undefined) throw new Error('式の解析に失敗: オペランド不足');
        switch (t.value) {
          case '+':
            st.push(a + b);
            break;
          case '-':
            st.push(a - b);
            break;
          case '*':
            st.push(a * b);
            break;
          case '/':
            // IPA疑似言語の割り算が整数/実数どちらかは問題文に依存し得るが、
            // このゲームは整数前提で作られているので整数除算(切り捨て)に寄せる。
            st.push(Math.trunc(a / b));
            break;
          default:
            throw new Error(`未対応の演算子 "${t.value}"`);
        }
        continue;
      }
      throw new Error(`式の解析に失敗: 不明トークン ${JSON.stringify(t)}`);
    }
    if (st.length !== 1) throw new Error('式の解析に失敗: スタックが不正です');
    return st[0];
  }

  /**
   * @param {string[]} codeLines
   * @returns {{
   *   varNames: string[],
   *   steps: Array<Record<string, any>>,
   *   outputVarNames: string[],
   *   answer: string,
   * }}
   */
  function traceProgram(codeLines) {
    const lines = codeLines.map(normalizeLine).filter(Boolean);
    /** @type {string[]} */
    const varNames = [];
    /** @type {Record<string, number>} */
    const env = {};
    /** @type {Array<Record<string, any>>} */
    const steps = [];
    /** @type {string[]} */
    let outputVarNames = [];

    // まず宣言/代入を順に実行。出力行があれば変数だけ抽出。
    /** @type {{kind:'decl'|'assign', label:string, name:string, expr:string}[]} */
    const stmts = [];

    for (const line of lines) {
      // 出力行（最後に来る想定だが途中でも拾えるようにする）
      if (line.includes('出力')) {
        const extracted = extractOutputVarNames(line);
        if (extracted.length > 0) outputVarNames = extracted;
        continue;
      }

      // 宣言: "整数型: x ← 1"
      let m = line.match(/^整数型\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*←\s*(.+)$/);
      if (m) {
        const name = m[1];
        const expr = m[2];
        if (!varNames.includes(name)) varNames.push(name);
        stmts.push({ kind: 'decl', label: line, name, expr });
        continue;
      }

      // 代入: "x ← y + z"
      m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*←\s*(.+)$/);
      if (m) {
        const name = m[1];
        const expr = m[2];
        if (!varNames.includes(name)) varNames.push(name);
        stmts.push({ kind: 'assign', label: line, name, expr });
        continue;
      }

      // それ以外は現状スキップ（ラベル等）
    }

    // 初期値（宣言＋代入をまとめて実行した時点のスナップショット）
    for (const s of stmts) {
      if (s.kind !== 'decl') break;
      env[s.name] = evalExpr(s.expr, env);
    }
    const initial = { step: '初期値' };
    for (const name of varNames) initial[name] = env[name];
    steps.push(initial);

    // 以降（宣言以外、もしくは宣言が途中に混ざっていても順に処理）
    let started = false;
    for (const s of stmts) {
      if (!started && s.kind === 'decl') continue;
      started = true;
      env[s.name] = evalExpr(s.expr, env);
      const snap = { step: s.label };
      for (const name of varNames) snap[name] = env[name];
      steps.push(snap);
    }

    // 出力変数が取れない場合は「宣言した順」で全部出す（ゲーム用途の保険）
    if (outputVarNames.length === 0) outputVarNames = [...varNames];

    const answer = outputVarNames.map((n) => String(env[n])).join(',');
    return { varNames, steps, outputVarNames, answer };
  }

  // グローバル公開（HTML直読み用途）
  window.TraceEngine = { traceProgram };
})();

