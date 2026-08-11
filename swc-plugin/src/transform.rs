use std::collections::{BTreeMap, HashMap, HashSet};

use swc_core::atoms::Atom;
use swc_core::common::errors::HANDLER;
use swc_core::common::util::take::Take;
use swc_core::common::{Spanned, DUMMY_SP};
use swc_core::ecma::ast::{
    Bool, CallExpr, Callee, Decl, Expr, Ident, ImportDecl, ImportSpecifier, Lit, Module,
    ModuleDecl, ModuleExportName, ModuleItem, ObjectPatProp, Pat, Program, Prop, PropName,
    PropOrSpread, Stmt, UnaryOp, VarDecl, VarDeclKind, VarDeclarator,
};
use swc_core::ecma::visit::{
    noop_visit_mut_type, noop_visit_type, Visit, VisitMut, VisitMutWith, VisitWith,
};

use crate::Config;

const MODULE_SPECIFIER: &str = "build-conditions";
const SWITCH_HELPER: &str = "switchBuildCondition";
const IS_HELPER: &str = "isBuildConditions";
const DEFAULT_KEY: &str = "default";
const REQUIRE_ATOM: &str = "require";

#[derive(Debug, Clone, Copy, PartialEq)]
enum Helper {
    Switch,
    Is,
}

/// Статус значения условия относительно конфига
#[derive(Debug, Clone, Copy, PartialEq)]
enum ConditionState {
    /// Значение совпало с зафиксированным значением своей группы
    ActiveFixed,
    /// Группа зафиксирована другим значением — условие заведомо неактивно
    InactiveFixed,
    /// Группа не зафиксирована (null) — активность известна только в runtime
    Runtime,
}

/// Результат статической оценки вызова isBuildConditions
#[derive(Debug, Clone, Copy, PartialEq)]
enum IsEval {
    Known(bool),
    /// Есть условия из незафиксированных групп — вызов остаётся в runtime
    Runtime,
}

/// Локальные имена хелперов пакета, доступные в скоупе
#[derive(Debug, Default)]
struct Scope {
    switch_local: Option<Atom>,
    is_local: Option<Atom>,
    namespace_local: Option<Atom>,
}

#[derive(Debug)]
pub struct TransformVisitor {
    /// Значение условия → имя его группы
    value_to_group: HashMap<String, String>,
    /// Группа → зафиксированное значение (None — группа переключается в runtime)
    conditions: BTreeMap<String, Option<String>>,

    scopes: Vec<Scope>,
    is_es_module: bool,

    /// Была ли выполнена хоть одна трансформация в модуле
    did_transform: bool,
    /// Идентификаторы из удалённых (мёртвых) веток — кандидаты на удаление импортов
    discarded_idents: HashSet<Atom>,
}

impl TransformVisitor {
    pub fn new(config: Config) -> TransformVisitor {
        let value_to_group = config.validate().unwrap_or_else(|error| panic!("{error}"));

        TransformVisitor {
            value_to_group,
            conditions: config.conditions,
            scopes: vec![],
            is_es_module: false,
            did_transform: false,
            discarded_idents: HashSet::new(),
        }
    }

    fn current_scope(&mut self) -> &mut Scope {
        self.scopes
            .last_mut()
            .expect("scopes should not be empty during traversal")
    }

    fn resolve_local(&self, sym: &Atom) -> Option<Helper> {
        for scope in self.scopes.iter().rev() {
            if scope.switch_local.as_ref() == Some(sym) {
                return Some(Helper::Switch);
            }
            if scope.is_local.as_ref() == Some(sym) {
                return Some(Helper::Is);
            }
        }

        None
    }

    fn is_namespace(&self, sym: &Atom) -> bool {
        self.scopes
            .iter()
            .any(|scope| scope.namespace_local.as_ref() == Some(sym))
    }

    /// Определяет, является ли callee вызовом одного из хелперов пакета.
    /// Поддержаны прямой идентификатор, `ns.helper` и `(0, ns.helper)`.
    fn resolve_helper(&self, callee: &Expr) -> Option<Helper> {
        if let Expr::Paren(paren) = callee {
            if let Some(seq) = paren.expr.as_seq() {
                if let Some(last) = seq.exprs.last() {
                    return self.resolve_helper(last);
                }
            }
        }

        match callee {
            Expr::Ident(ident) => self.resolve_local(&ident.sym),
            Expr::Member(member) => {
                let object = member.obj.as_ident()?;

                if !self.is_namespace(&object.sym) {
                    return None;
                }

                let prop = member.prop.as_ident()?;

                match prop.sym.as_str() {
                    SWITCH_HELPER => Some(Helper::Switch),
                    IS_HELPER => Some(Helper::Is),
                    _ => None,
                }
            }
            _ => None,
        }
    }

    /// Callee вызова, если это вызов isBuildConditions
    fn as_is_call<'a>(&self, expr: &'a Expr) -> Option<&'a CallExpr> {
        let Expr::Call(call) = expr else {
            return None;
        };
        let Callee::Expr(callee) = &call.callee else {
            return None;
        };

        matches!(self.resolve_helper(callee), Some(Helper::Is)).then_some(call)
    }

    /// Регистрирует хелпер по имени экспорта из пакета
    fn register_export_name(&mut self, export_name: &str, local: &Atom) {
        match export_name {
            SWITCH_HELPER => self.current_scope().switch_local = Some(local.clone()),
            IS_HELPER => self.current_scope().is_local = Some(local.clone()),
            _ => {}
        }
    }

    fn is_require_from_module(call: &CallExpr) -> bool {
        let is_require = match &call.callee {
            Callee::Expr(expr) => {
                matches!(&**expr, Expr::Ident(ident) if ident.sym.as_str() == REQUIRE_ATOM)
            }
            _ => false,
        };

        if !is_require {
            return false;
        }

        call.args.first().is_some_and(|arg| {
            matches!(
                &*arg.expr,
                Expr::Lit(Lit::Str(str)) if str.value.as_str().is_some_and(|value| value == MODULE_SPECIFIER)
            )
        })
    }

    /// Статус значения условия. None — значение не найдено ни в одной группе
    fn resolve_condition(&self, value: &str) -> Option<ConditionState> {
        let group = self.value_to_group.get(value)?;

        Some(match &self.conditions[group] {
            Some(chosen) if chosen == value => ConditionState::ActiveFixed,
            Some(_) => ConditionState::InactiveFixed,
            None => ConditionState::Runtime,
        })
    }

    /// Запоминает идентификаторы выброшенного узла — после обхода модуля
    /// их импорты будут удалены, если не осталось других использований
    fn discard<N: VisitWith<IdentCollector>>(&mut self, node: &N) {
        let mut collector = IdentCollector::default();
        node.visit_with(&mut collector);
        self.discarded_idents.extend(collector.idents);
    }

    /// Извлекает значения условий из аргумента isBuildConditions.
    /// Err(span) — аргумент не строковый литерал и не массив строковых литералов
    fn extract_is_values(call: &CallExpr) -> Result<Vec<&str>, swc_core::common::Span> {
        let Some(arg) = call.args.first() else {
            return Err(call.span);
        };

        if arg.spread.is_some() {
            return Err(arg.expr.span());
        }

        let mut values = vec![];

        match &*arg.expr {
            Expr::Lit(Lit::Str(str)) => {
                values.push(str.value.as_str().ok_or(arg.expr.span())?);
            }
            Expr::Array(array) => {
                for element in array.elems.iter() {
                    let Some(element) = element else {
                        return Err(arg.expr.span());
                    };

                    if element.spread.is_some() {
                        return Err(element.expr.span());
                    }

                    match &*element.expr {
                        Expr::Lit(Lit::Str(str)) => {
                            values.push(str.value.as_str().ok_or(element.expr.span())?);
                        }
                        other => return Err(other.span()),
                    }
                }
            }
            other => return Err(other.span()),
        }

        Ok(values)
    }

    /// Статическая оценка значений isBuildConditions.
    /// Err — среди значений есть неизвестное (нет ни в одной группе конфига)
    fn eval_is_values(&self, values: &[&str]) -> Result<IsEval, String> {
        let mut has_runtime = false;

        for &value in values {
            match self.resolve_condition(value) {
                None => return Err(value.to_string()),
                // Условие из зафиксированной группы не совпало — весь вызов
                // статически false, даже если остальные условия runtime
                Some(ConditionState::InactiveFixed) => return Ok(IsEval::Known(false)),
                Some(ConditionState::Runtime) => has_runtime = true,
                Some(ConditionState::ActiveFixed) => {}
            }
        }

        if has_runtime {
            Ok(IsEval::Runtime)
        } else {
            Ok(IsEval::Known(true))
        }
    }

    fn unknown_value_error(&self, span: swc_core::common::Span, value: &str) {
        let groups = self
            .conditions
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>()
            .join(", ");

        HANDLER.with(|handler| {
            handler.span_err(
                span,
                &format!(
                    "build-conditions: значение условия '{value}' не найдено ни в одной группе конфига (группы: {groups})"
                ),
            )
        });
    }

    /// Трансформация `isBuildConditions(условие | [условия])`. Возвращает
    /// булев литерал или `None`, если вызов должен остаться в runtime
    fn transform_is(&mut self, call: &CallExpr) -> Option<Expr> {
        let values = match Self::extract_is_values(call) {
            Ok(values) => values,
            Err(span) => {
                HANDLER.with(|handler| {
                    handler.span_err(
                        span,
                        "build-conditions: isBuildConditions принимает только строковый литерал или массив строковых литералов; для динамических проверок используйте getBuildConditions",
                    )
                });

                return None;
            }
        };

        let result = match self.eval_is_values(&values) {
            Ok(IsEval::Known(result)) => result,
            Ok(IsEval::Runtime) => return None,
            Err(value) => {
                self.unknown_value_error(call.span, &value);

                return None;
            }
        };

        self.did_transform = true;

        Some(Expr::Lit(Lit::Bool(Bool {
            span: DUMMY_SP,
            value: result,
        })))
    }

    /// Ключ свойства карты условий: `key: value` или shorthand `{ key }`
    fn prop_key(prop: &PropOrSpread) -> Option<Atom> {
        let PropOrSpread::Prop(prop) = prop else {
            return None;
        };

        match &**prop {
            Prop::KeyValue(key_value) => match &key_value.key {
                PropName::Ident(ident) => Some(ident.sym.clone()),
                PropName::Str(str) => str.value.as_str().map(Atom::new),
                _ => None,
            },
            Prop::Shorthand(ident) => Some(ident.sym.clone()),
            _ => None,
        }
    }

    /// Трансформация `switchBuildCondition(map)`. Возвращает выражение-замену
    /// или `None`, если вызов должен остаться в runtime
    fn transform_switch(&mut self, call: &mut CallExpr) -> Option<Expr> {
        let call_span = call.span;

        let Some(arg) = call.args.first_mut() else {
            return None;
        };

        let arg_span = arg.expr.span();
        let object = if arg.spread.is_none() { arg.expr.as_mut_object() } else { None };

        let Some(object) = object else {
            HANDLER.with(|handler| {
                handler.span_err(
                    arg_span,
                    "build-conditions: switchBuildCondition принимает только объектный литерал с ветками условий",
                )
            });

            return None;
        };

        let mut keys: Vec<Atom> = Vec::with_capacity(object.props.len());

        for prop in object.props.iter() {
            match Self::prop_key(prop) {
                Some(key) => keys.push(key),
                None => {
                    HANDLER.with(|handler| {
                        handler.span_err(
                            prop.span(),
                            "build-conditions: switchBuildCondition поддерживает только свойства вида `условие: значение`",
                        )
                    });

                    return None;
                }
            }
        }

        // Разрешаем группу каждой ветки; ключи (кроме default) обязаны
        // принадлежать одной группе — как и в типах (SingleGroup)
        let mut map_group: Option<&String> = None;

        for key in &keys {
            if key.as_str() == DEFAULT_KEY {
                continue;
            }

            let Some(group) = self.value_to_group.get(key.as_str()) else {
                self.unknown_value_error(call_span, key.as_str());

                return None;
            };

            match map_group {
                None => map_group = Some(group),
                Some(existing) if existing == group => {}
                Some(existing) => {
                    HANDLER.with(|handler| {
                        handler.span_err(
                            call_span,
                            &format!(
                                "build-conditions: ветки switchBuildCondition из разных групп условий ('{existing}' и '{group}')"
                            ),
                        )
                    });

                    return None;
                }
            }
        }

        // Группа карты не зафиксирована — вызов остаётся в runtime
        if let Some(group) = map_group {
            if self.conditions[group].is_none() {
                return None;
            }
        }

        let winner_index = keys
            .iter()
            .position(|key| {
                key.as_str() != DEFAULT_KEY
                    && self.resolve_condition(key.as_str()) == Some(ConditionState::ActiveFixed)
            })
            .or_else(|| keys.iter().position(|key| key.as_str() == DEFAULT_KEY));

        let Some(winner_index) = winner_index else {
            HANDLER.with(|handler| {
                handler.span_err(
                    call_span,
                    "build-conditions: ни одна ветка switchBuildCondition не совпала с зафиксированными условиями и нет ветки default",
                )
            });

            return None;
        };

        // Значение победителя забираем по владению (вызов целиком будет
        // заменён им), значения мёртвых веток не клонируем — только собираем
        // их идентификаторы для чистки импортов
        let mut winner: Option<Expr> = None;

        for (index, prop) in object.props.iter_mut().enumerate() {
            let PropOrSpread::Prop(prop) = prop else {
                continue;
            };

            match &mut **prop {
                Prop::KeyValue(key_value) => {
                    if index == winner_index {
                        winner = Some(*key_value.value.take());
                    } else {
                        self.discard(&*key_value.value);
                    }
                }
                Prop::Shorthand(ident) => {
                    if index == winner_index {
                        winner = Some(Expr::Ident(ident.clone()));
                    } else {
                        self.discard(&*ident);
                    }
                }
                _ => {}
            }
        }

        self.did_transform = true;

        winner
    }

    /// Статическая оценка условия if-стейтмента: прямой вызов isBuildConditions
    /// или его отрицание (в т.ч. `!!`). Ошибки здесь не эмитятся — если оценка
    /// не удалась, вызов пройдёт обычный путь трансформации выражений
    fn try_eval_if_test(&self, test: &Expr) -> Option<bool> {
        if let Expr::Unary(unary) = test {
            if unary.op == UnaryOp::Bang {
                return self.try_eval_if_test(&unary.arg).map(|value| !value);
            }

            return None;
        }

        let call = self.as_is_call(test)?;
        let values = Self::extract_is_values(call).ok()?;

        match self.eval_is_values(&values).ok()? {
            IsEval::Known(value) => Some(value),
            IsEval::Runtime => None,
        }
    }

    /// Удаляет ставшие неиспользуемыми импорты: хелперы пакета без оставшихся
    /// вызовов и идентификаторы из мёртвых веток
    fn cleanup_imports(&mut self, module: &mut Module) {
        let mut usage = IdentCollector::default();

        for item in module.body.iter() {
            if matches!(item, ModuleItem::ModuleDecl(ModuleDecl::Import(_))) {
                continue;
            }

            item.visit_with(&mut usage);
        }

        let used = usage.idents;
        let discarded = &self.discarded_idents;

        module.body.retain_mut(|item| {
            let ModuleItem::ModuleDecl(ModuleDecl::Import(import)) = item else {
                return true;
            };

            if import.specifiers.is_empty() {
                // Side-effect импорт (`import './styles.css'`) не трогаем
                return true;
            }

            let is_module_import = import.src.value.eq(MODULE_SPECIFIER);

            import.specifiers.retain(|specifier| {
                let local = match specifier {
                    ImportSpecifier::Named(named) => &named.local,
                    ImportSpecifier::Default(default) => &default.local,
                    ImportSpecifier::Namespace(namespace) => &namespace.local,
                };

                if used.contains(&local.sym) {
                    return true;
                }

                if is_module_import {
                    // Из импорта пакета удаляем только хелперы трансформации и
                    // namespace: рантайм-хелперы (setBuildConditions и т.п.) не трогаем
                    match specifier {
                        ImportSpecifier::Named(named) => {
                            let export_name = match &named.imported {
                                Some(ModuleExportName::Ident(imported)) => imported.sym.as_str(),
                                Some(ModuleExportName::Str(_)) => return true,
                                None => named.local.sym.as_str(),
                            };

                            !matches!(export_name, SWITCH_HELPER | IS_HELPER)
                        }
                        ImportSpecifier::Namespace(_) => false,
                        ImportSpecifier::Default(_) => true,
                    }
                } else {
                    // Из прочих импортов удаляем только значения из мёртвых веток
                    !discarded.contains(&local.sym)
                }
            });

            !import.specifiers.is_empty()
        });
    }
}

impl VisitMut for TransformVisitor {
    noop_visit_mut_type!();

    fn visit_mut_program(&mut self, node: &mut Program) {
        self.is_es_module = node.is_module();

        // Быстрый выход: в Module-программах ссылка на пакет — import или
        // top-level `require` — всегда на верхнем уровне, без неё обход
        // дерева не нужен. Экзотика вроде require пакета только внутри
        // функций Module-программы не трансформируется, но остаётся рабочей:
        // у хелперов есть runtime-реализация. Script (CommonJS) обходим
        // всегда — там require может встретиться в любом скоупе.
        if let Program::Module(module) = &*node {
            if !module_references_package(module) {
                return;
            }
        }

        self.scopes.push(Scope::default());

        node.visit_mut_children_with(self);

        self.scopes.pop();

        if self.did_transform {
            if let Program::Module(module) = node {
                self.cleanup_imports(module);
            }
        }
    }

    fn visit_mut_import_decl(&mut self, node: &mut ImportDecl) {
        if !node.src.value.eq(MODULE_SPECIFIER) {
            return;
        }

        for specifier in node.specifiers.iter() {
            match specifier {
                ImportSpecifier::Namespace(namespace) => {
                    self.current_scope().namespace_local = Some(namespace.local.sym.clone());
                }
                ImportSpecifier::Named(named) => {
                    let export_name = match &named.imported {
                        Some(ModuleExportName::Ident(imported)) => &imported.sym,
                        Some(ModuleExportName::Str(_)) => {
                            HANDLER.with(|handler| {
                                handler.span_err(
                                    node.span,
                                    "build-conditions: строковые литералы в импортах не поддерживаются",
                                )
                            });

                            continue;
                        }
                        None => &named.local.sym,
                    };

                    self.register_export_name(export_name.as_str(), &named.local.sym);
                }
                ImportSpecifier::Default(_) => {}
            }
        }
    }

    fn visit_mut_var_declarator(&mut self, node: &mut VarDeclarator) {
        node.visit_mut_children_with(self);

        let Some(init) = &node.init else {
            return;
        };
        let Expr::Call(call) = &**init else {
            return;
        };

        if !Self::is_require_from_module(call) {
            return;
        }

        match &node.name {
            Pat::Ident(ident) => {
                self.current_scope().namespace_local = Some(ident.id.sym.clone());
            }
            Pat::Object(object) => {
                for prop in object.props.iter() {
                    match prop {
                        ObjectPatProp::Assign(assign) => {
                            self.register_export_name(assign.key.sym.as_str(), &assign.key.sym);
                        }
                        ObjectPatProp::KeyValue(key_value) => {
                            let PropName::Ident(key) = &key_value.key else {
                                continue;
                            };
                            let Some(local) = key_value.value.as_ident() else {
                                continue;
                            };

                            self.register_export_name(key.sym.as_str(), &local.id.sym);
                        }
                        ObjectPatProp::Rest(_) => {}
                    }
                }
            }
            _ => {}
        }
    }

    fn visit_mut_block_stmt(&mut self, node: &mut swc_core::ecma::ast::BlockStmt) {
        if self.is_es_module {
            node.visit_mut_children_with(self);

            return;
        }

        // В CommonJS require может встречаться внутри функций — заводим скоуп
        self.scopes.push(Scope::default());
        node.visit_mut_children_with(self);
        self.scopes.pop();
    }

    fn visit_mut_stmt(&mut self, stmt: &mut Stmt) {
        // Вырезание мёртвых веток `if (isBuildConditions(...))` до обхода детей:
        // после замены вызова на литерал вызов уже не отличить от написанного руками
        if let Stmt::If(if_stmt) = stmt {
            if let Some(test_result) = self.try_eval_if_test(&if_stmt.test) {
                let dropped: Option<&Stmt> = if test_result {
                    if_stmt.alt.as_deref()
                } else {
                    Some(&if_stmt.cons)
                };

                // `var` из удалённой ветки всплывает на уровень функции —
                // такую ветку не вырезаем, `if (false)` доедят бандлер и минификатор
                let hoists_var = dropped.is_some_and(has_hoisted_var);

                if !hoists_var {
                    if let Some(dropped) = dropped {
                        self.discard(dropped);
                    }

                    // Ветки забираем по владению — if целиком будет перезаписан
                    let taken: Option<Stmt> = if test_result {
                        Some(*if_stmt.cons.take())
                    } else {
                        if_stmt.alt.take().map(|alt| *alt)
                    };

                    self.did_transform = true;

                    match taken {
                        // Ветка остаётся блоком — сохраняем скоуп let/const
                        Some(taken) => {
                            *stmt = taken;
                            // Выжившая ветка обходится заново: внутри могут быть
                            // вложенные вызовы хелперов и else-if цепочки
                            self.visit_mut_stmt(stmt);
                        }
                        None => {
                            *stmt = Stmt::Empty(swc_core::ecma::ast::EmptyStmt { span: DUMMY_SP });
                        }
                    }

                    return;
                }
            }
        }

        stmt.visit_mut_children_with(self);
    }

    fn visit_mut_stmts(&mut self, stmts: &mut Vec<Stmt>) {
        stmts.visit_mut_children_with(self);

        stmts.retain(|stmt| !matches!(stmt, Stmt::Empty(..)));
    }

    fn visit_mut_module_items(&mut self, items: &mut Vec<ModuleItem>) {
        items.visit_mut_children_with(self);

        items.retain(|item| !matches!(item, ModuleItem::Stmt(Stmt::Empty(..))));
    }

    fn visit_mut_expr(&mut self, node: &mut Expr) {
        node.visit_mut_children_with(self);

        let Expr::Call(call) = node else {
            return;
        };
        let Callee::Expr(callee) = &call.callee else {
            return;
        };

        let replacement = match self.resolve_helper(callee) {
            Some(Helper::Switch) => self.transform_switch(call),
            Some(Helper::Is) => self.transform_is(call),
            None => None,
        };

        if let Some(replacement) = replacement {
            *node = replacement;
        }
    }
}

/// Есть ли в узле `var`-декларации, всплывающие из блока (без захода
/// во вложенные функции — у них свой скоуп)
fn has_hoisted_var(stmt: &Stmt) -> bool {
    let mut finder = HoistedVarFinder::default();
    stmt.visit_with(&mut finder);
    finder.found
}

#[derive(Default)]
struct HoistedVarFinder {
    found: bool,
}

impl Visit for HoistedVarFinder {
    noop_visit_type!();

    fn visit_var_decl(&mut self, node: &VarDecl) {
        if node.kind == VarDeclKind::Var {
            self.found = true;
        }

        node.visit_children_with(self);
    }

    fn visit_function(&mut self, _: &swc_core::ecma::ast::Function) {}

    fn visit_arrow_expr(&mut self, _: &swc_core::ecma::ast::ArrowExpr) {}
}

/// Собирает идентификаторы поддерева: мёртвых веток при трансформации
/// и всего модуля (вне импортов) при чистке импортов
#[derive(Default)]
struct IdentCollector {
    idents: HashSet<Atom>,
}

impl Visit for IdentCollector {
    noop_visit_type!();

    fn visit_ident(&mut self, ident: &Ident) {
        self.idents.insert(ident.sym.clone());
    }
}

/// Есть ли на верхнем уровне модуля ссылка на пакет: import с его specifier
/// или var-декларация с `require` пакета в инициализаторе
fn module_references_package(module: &Module) -> bool {
    module.body.iter().any(|item| match item {
        ModuleItem::ModuleDecl(ModuleDecl::Import(import)) => {
            import.src.value.eq(MODULE_SPECIFIER)
        }
        ModuleItem::Stmt(Stmt::Decl(Decl::Var(var))) => var.decls.iter().any(|decl| {
            matches!(
                decl.init.as_deref(),
                Some(Expr::Call(call)) if TransformVisitor::is_require_from_module(call)
            )
        }),
        _ => false,
    })
}
