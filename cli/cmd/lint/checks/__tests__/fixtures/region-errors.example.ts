// ================================================================
// Файл-пример: ВСЕ случаи, которые lint считает ОШИБКАМИ для регионов
// Каждый блок подписан — какой код ошибки и почему.
// ================================================================

// ==================================================================
// 1. ANCHOR_AT_CLASS_BODY — регион на уровне тела класса
// ==================================================================

// ❌ AB-25: START и END между методами
export class Example25 {
  // #region START_MID
  // #endregion END_MID
}

// ❌ AB-26: регион оборачивает метод на уровне тела
export class Example26 {
  // #region START_WRAP
  bar() {
    return 1;
  }
  // #endregion END_WRAP
}

// ❌ AB-27: регион оборачивает несколько методов на уровне тела
export class Example27 {
  // #region START_MULTI
  bar() {
    return 1;
  }
  baz() {
    return 2;
  }
  // #endregion END_MULTI
}

// ❌ AB-28: пустой регион на уровне тела
export class Example28 {
  // #region START_EMPTY
  // #endregion END_EMPTY
  bar() {
    return 1;
  }
}

// ❌ AB-29: регион оборачивает свойство (не метод)
export class Example29 {
  // #region START_PROP
  readonly name: string = 'foo';
  // #endregion END_PROP
}

// ❌ AB-30: START и END между разными методами
export class Example30 {
  bar() {
    return 1;
  }
  // #region START_GAP
  baz() {
    return 2;
  }
  // #endregion END_GAP
  qux() {
    return 3;
  }
}

// ❌ AB-31: только START на уровне тела (нет END)
export class Example31 {
  // #region START_ORPHAN
  bar() {
    return 1;
  }
}

// ❌ AB-32: только END на уровне тела (нет START)
export class Example32 {
  bar() {
    return 1;
  }
  // #endregion END_ORPHAN
}

// ❌ AB-34: класс с extends, регион на уровне тела
export class Example34 extends Base {
  // #region START_EXT
  // #endregion END_EXT
}

// ❌ AB-35: класс с implements, регион на уровне тела
export class Example35 implements IFoo {
  // #region START_IMPL
  // #endregion END_IMPL
}

// ❌ AB-36: абстрактный класс, регион на уровне тела
export abstract class Example36 {
  // #region START_ABS
  // #endregion END_ABS
}

// ❌ AB-37: export default class, регион на уровне тела
export default class Example37 {
  // #region START_DEF
  // #endregion END_DEF
}

// ❌ AB-38: START на уровне тела, END внутри метода (рассечение)
export class Example38 {
  // #region START_SPLIT        ← ошибка здесь
  bar() {
    const x = 1;
    // #endregion END_SPLIT    ← END внутри метода
    return x;
  }
}

// ❌ AB-39: START внутри метода, END на уровне тела (рассечение)
export class Example39 {
  bar() {
    // #region START_SPLIT2     ← START внутри метода
    const x = 1;
  }
  // #endregion END_SPLIT2      ← ошибка здесь
}

// ❌ AB-43: namespace — регион на уровне тела
export namespace Example43 {
  // #region START_NS
  export function f() {
    return 1;
  }
  // #endregion END_NS
}

// ❌ AB-45: класс внутри namespace, регион на уровне тела класса
export namespace N {
  export class Example45 {
    // #region START_NSCLASS
    // #endregion END_NSCLASS
  }
}

// ❌ AB-66: generic-класс, регион на уровне тела
export class Example66<T> {
  // #region START_GEN
  // #endregion END_GEN
}

// ❌ AB-65: тело класса на следующей строке
export class Example65
{
  // #region START_BODYNEXT
  // #endregion END_BODYNEXT
}

// ==================================================================
// 2. ANCHOR_CONSECUTIVE_START — два START подряд на одном уровне
// ==================================================================

// ❌ CS-03: два START на соседних строках, top-level
// #region START_FIRST
// #region START_SECOND   ← ошибка: consecutive после FIRST
code();
// #endregion END_SECOND
// #endregion END_FIRST

// ❌ CS-04: два START подряд внутри метода
function example04() {
  // #region START_INNER_A
  // #region START_INNER_B   ← ошибка: consecutive после INNER_A
  code();
  // #endregion END_INNER_B
  // #endregion END_INNER_A
}

// ❌ CS-05: START → пустая строка → START
// #region START_GAP_A

// #region START_GAP_B      ← ошибка: consecutive после GAP_A
code();
// #endregion END_GAP_B
// #endregion END_GAP_A

// ❌ CS-06: START → комментарий → START
// #region START_CMT_A
// some comment here
// #region START_CMT_B      ← ошибка: consecutive после CMT_A
code();
// #endregion END_CMT_B
// #endregion END_CMT_A

// ❌ CS-12: два START подряд → оба закрыты
// #region START_NEST_A
// #region START_NEST_B     ← ошибка: consecutive после NEST_A
code();
// #endregion END_NEST_B
// #endregion END_NEST_A

// ❌ CS-13: три START подряд
// #region START_TRIPLE_A
// #region START_TRIPLE_B   ← ошибка: consecutive
// #region START_TRIPLE_C   ← ошибка: consecutive
code();
// #endregion END_TRIPLE_C
// #endregion END_TRIPLE_B
// #endregion END_TRIPLE_A

// ❌ CS-16: два START на уровне тела класса + consecutive
export class Example16 {
  // #region START_CLS_A    ← ошибка: AT_CLASS_BODY
  // #region START_CLS_B    ← ошибка: AT_CLASS_BODY + CONSECUTIVE_START
  // #endregion END_CLS_B
  // #endregion END_CLS_A
}

// ==================================================================
// 3. Базовые ошибки AnchorCheck (UNPAIRED, NESTING, MALFORMED)
// ==================================================================

// ❌ A2: START без END
// #region START_NOEND
code();

// ❌ A3: END без START
// #endregion END_NOSTART

// ❌ A4: закрытие родителя при открытом ребёнке
// #region START_PARENT
// #region START_CHILD
code();
// #endregion END_PARENT   ← ошибка: NESTING, CHILD ещё открыт

// ❌ A5: bare #region без START_ префикса
// #region
code();
// #endregion

// ❌ A6: bare #endregion (стек не пуст)
// #region START_WRAPPED
code();
// #endregion               ← ошибка: MALFORMED, auto-close по START_WRAPPED
