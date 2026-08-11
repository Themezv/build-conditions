//! SWC-плагин пакета `build-conditions`.
//!
//! Заменяет вызовы `switchBuildCondition` / `isBuildConditions` на compile-time
//! значения по конфигурации:
//!
//! ```json
//! {
//!     "groups": { "platform": ["desktop", "mobile"], "runtime": ["server", "client"] },
//!     "conditions": { "platform": "desktop", "runtime": null }
//! }
//! ```
//!
//! - группа со строковым значением в `conditions` зафиксирована: совпавшая
//!   ветка инлайнится, `isBuildConditions` сворачивается в `true` / `false`,
//!   мёртвые ветки `if (isBuildConditions(...))` вырезаются вместе со ставшими
//!   ненужными импортами;
//! - группа со значением `null` не зафиксирована: её вызовы остаются в runtime.
//!
//! `groups` содержит полный состав значений каждой группы — по нему значение
//! однозначно разрешается в группу (значения уникальны между группами).
//! Аргументы хелперов обязаны быть литералами; значение, не найденное ни
//! в одной группе, — ошибка сборки. Для динамических проверок предназначен
//! `getBuildConditions`, который плагин сознательно не трогает.

mod transform;

use serde::Deserialize;
use std::collections::BTreeMap;
use swc_core::ecma::ast::Program;
use swc_core::ecma::visit::VisitMutWith;
use swc_core::plugin::{plugin_transform, proxies::TransformPluginProgramMetadata};

pub use transform::TransformVisitor;

/// Конфигурация плагина, см. `PluginOptions` в `build-conditions`
#[derive(Deserialize, Debug, Default, Clone)]
pub struct Config {
    /// Полный состав групп условий: группа → все её значения
    pub groups: BTreeMap<String, Vec<String>>,
    /// Выбранные значения групп: строка — группа зафиксирована, null — runtime
    pub conditions: BTreeMap<String, Option<String>>,
}

impl Config {
    /// Валидирует конфигурацию и строит отображение «значение условия → его группа».
    ///
    /// Проверяются инварианты:
    /// - составы групп в `groups` и `conditions` совпадают;
    /// - значения условий уникальны между группами;
    /// - зафиксированное значение принадлежит своей группе.
    pub fn validate(&self) -> Result<std::collections::HashMap<String, String>, String> {
        let mut value_to_group = std::collections::HashMap::new();

        for (group, values) in &self.groups {
            if !self.conditions.contains_key(group) {
                return Err(format!(
                    "build-conditions: группа '{group}' есть в groups, но отсутствует в conditions"
                ));
            }

            for value in values {
                if let Some(other) = value_to_group.insert(value.clone(), group.clone()) {
                    return Err(format!(
                        "build-conditions: значение '{value}' принадлежит сразу двум группам ('{other}' и '{group}'), значения должны быть уникальны между группами"
                    ));
                }
            }
        }

        for (group, chosen) in &self.conditions {
            let Some(values) = self.groups.get(group) else {
                return Err(format!(
                    "build-conditions: группа '{group}' есть в conditions, но отсутствует в groups"
                ));
            };

            if let Some(chosen) = chosen {
                if !values.contains(chosen) {
                    return Err(format!(
                        "build-conditions: значение '{chosen}' не принадлежит группе '{group}'"
                    ));
                }
            }
        }

        Ok(value_to_group)
    }
}

#[cfg(test)]
mod tests {
    use super::Config;

    fn config(json: &str) -> Config {
        serde_json::from_str(json).expect("invalid config json")
    }

    #[test]
    fn valid_config_builds_value_to_group_map() {
        let map = config(
            r#"{
                "groups": { "platform": ["desktop", "mobile"], "runtime": ["server", "client"] },
                "conditions": { "platform": "desktop", "runtime": null }
            }"#,
        )
        .validate()
        .expect("config should be valid");

        assert_eq!(map.len(), 4);
        assert_eq!(map.get("desktop").map(String::as_str), Some("platform"));
        assert_eq!(map.get("mobile").map(String::as_str), Some("platform"));
        assert_eq!(map.get("server").map(String::as_str), Some("runtime"));
        assert_eq!(map.get("client").map(String::as_str), Some("runtime"));
    }

    #[test]
    fn empty_config_is_valid() {
        let map = config(r#"{ "groups": {}, "conditions": {} }"#)
            .validate()
            .expect("empty config should be valid");

        assert!(map.is_empty());
    }

    #[test]
    fn group_missing_in_conditions() {
        let error = config(r#"{ "groups": { "platform": ["desktop", "mobile"] }, "conditions": {} }"#)
            .validate()
            .unwrap_err();

        assert!(
            error.contains("группа 'platform' есть в groups, но отсутствует в conditions"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn group_missing_in_groups() {
        let error = config(r#"{ "groups": {}, "conditions": { "platform": "desktop" } }"#)
            .validate()
            .unwrap_err();

        assert!(
            error.contains("группа 'platform' есть в conditions, но отсутствует в groups"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn duplicate_value_between_groups() {
        let error = config(
            r#"{
                "groups": { "platform": ["desktop", "mobile"], "runtime": ["server", "desktop"] },
                "conditions": { "platform": "desktop", "runtime": "server" }
            }"#,
        )
        .validate()
        .unwrap_err();

        assert!(
            error.contains("значение 'desktop' принадлежит сразу двум группам"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn chosen_value_not_in_group() {
        let error = config(
            r#"{
                "groups": { "platform": ["desktop", "mobile"] },
                "conditions": { "platform": "tablet" }
            }"#,
        )
        .validate()
        .unwrap_err();

        assert!(
            error.contains("значение 'tablet' не принадлежит группе 'platform'"),
            "unexpected error: {error}"
        );
    }
}

#[plugin_transform]
pub fn process_transform(
    mut program: Program,
    metadata: TransformPluginProgramMetadata,
) -> Program {
    let config: Config = serde_json::from_str(
        &metadata
            .get_transform_plugin_config()
            .expect("failed to get build-conditions plugin config"),
    )
    .expect("invalid build-conditions plugin config");

    program.visit_mut_with(&mut TransformVisitor::new(config));
    program
}
