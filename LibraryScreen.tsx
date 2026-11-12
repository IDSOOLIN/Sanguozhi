import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import officialLibrary from './data/official-library.json';
import { officialLibraryAssets } from './data/official-library-assets';
import { teamLibraryCategory } from './data/team-library';

type LibraryDetailField = {
  key: string;
  value: string;
};

type LibraryItem = {
  id: string;
  name: string;
  filters: Record<string, string[]>;
  details: LibraryDetailField[];
  imageAssetKey: string;
  artworkAssetKey: string;
};

type LibraryFilter = {
  key: string;
  label: string;
  options: string[];
};

type LibraryCategory = {
  key: string;
  label: string;
  filters: LibraryFilter[];
  items: LibraryItem[];
};

type LibraryData = {
  source: string;
  syncedAt: string;
  categories: LibraryCategory[];
};

export type LibraryItemOverride = {
  name: string;
  filters: Record<string, string[]>;
  details: LibraryDetailField[];
};

export type LibraryOverrides = Record<string, LibraryItemOverride>;
export const LIBRARY_OVERRIDES_KEY = 'sanguo.library.overrides.v1';

const baseLibrary = officialLibrary as LibraryData;
const library: LibraryData = {
  ...baseLibrary,
  categories: [...baseLibrary.categories, teamLibraryCategory as LibraryCategory],
};
const generalItemsByName = new Map(
  (baseLibrary.categories.find(category => category.key === 'generals')?.items || [])
    .map(item => [item.name, item] as const),
);
const TROOP_TYPES = [
  { label: '骑兵', key: '兵种适性骑兵', icon: 'navigate-outline' as const },
  { label: '盾兵', key: '兵种适性盾兵', icon: 'shield-outline' as const },
  { label: '弓兵', key: '兵种适性弓兵', icon: 'git-branch-outline' as const },
  { label: '枪兵', key: '兵种适性枪兵', icon: 'flash-outline' as const },
  { label: '器械', key: '兵种适性器械', icon: 'settings-outline' as const },
];
const GENERAL_ATTRIBUTES = [
  { label: '武力', key: '武力', icon: 'flash-outline' as const },
  { label: '智力', key: '智力', icon: 'bulb-outline' as const },
  { label: '统率', key: '统率', icon: 'shield-checkmark-outline' as const },
  { label: '速度', key: '速度', icon: 'speedometer-outline' as const },
  { label: '政治', key: '政治', icon: 'business-outline' as const },
  { label: '魅力', key: '魅力', icon: 'heart-outline' as const },
];
const GENERAL_GROWTH_KEYS = GENERAL_ATTRIBUTES.map(attribute => `${attribute.key}成长`);
const GENERAL_STRUCTURED_KEYS = new Set([
  ...TROOP_TYPES.map(item => item.key),
  ...GENERAL_ATTRIBUTES.map(item => item.key),
  ...GENERAL_GROWTH_KEYS,
  '自带战法',
  '自带战法分类',
  '自带战法目标',
  '自带战法发动概率',
  '自带战法描述',
  '传承战法',
  '传承战法分类',
  '传承战法目标',
  '传承战法发动概率',
  '传承战法描述',
]);

const readTeamMembers = (item: LibraryItem) => {
  const values = new Map(item.details.map(detail => [detail.key, detail.value]));
  return [1, 2, 3].map(number => ({
    role: number === 1 ? '主将' : '副将',
    name: values.get(`武将${number}`) || '待补充',
    tactics: values.get(`武将${number}战法`) || '待补充',
    books: values.get(`武将${number}兵书`) || '待补充',
    points: values.get(`武将${number}加点`) || '待补充',
    gear: values.get(`武将${number}装备`) || '无',
    note: values.get(`武将${number}治军`) || '',
  }));
};

const EDGE_SWIPE_START_WIDTH = 28;
const EDGE_SWIPE_TRIGGER_DISTANCE = 72;
const AnimatedSafeAreaView = Animated.createAnimatedComponent(SafeAreaView);

function useEdgeSwipeBack(onBack: () => void) {
  const onBackRef = useRef(onBack);
  const translateX = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (event, gesture) => {
      const startX = event.nativeEvent.pageX - gesture.dx;
      return startX <= EDGE_SWIPE_START_WIDTH
        && gesture.dx > 8
        && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25;
    },
    onPanResponderMove: (_event, gesture) => {
      translateX.setValue(Math.max(0, gesture.dx));
    },
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dx >= EDGE_SWIPE_TRIGGER_DISTANCE && gesture.vx > 0) {
        Animated.timing(translateX, {
          toValue: Dimensions.get('window').width,
          duration: 160,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) {
            onBackRef.current();
            return;
          }
          Animated.spring(translateX, {
            toValue: 0,
            speed: 24,
            bounciness: 0,
            useNativeDriver: true,
          }).start();
        });
        return;
      }
      Animated.spring(translateX, {
        toValue: 0,
        speed: 24,
        bounciness: 0,
        useNativeDriver: true,
      }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(translateX, {
        toValue: 0,
        speed: 24,
        bounciness: 0,
        useNativeDriver: true,
      }).start();
    },
    onPanResponderTerminationRequest: () => true,
  }), [translateX]);

  return {
    panHandlers: responder.panHandlers,
    swipeBackStyle: { transform: [{ translateX }] },
  };
}

function LibraryDetail({
  item,
  category,
  modified,
  onBack,
  onSave,
  onReset,
}: {
  item: LibraryItem;
  category: LibraryCategory;
  modified: boolean;
  onBack: () => void;
  onSave: (item: LibraryItem) => void;
  onReset: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LibraryItem>(() => ({
    ...item,
    filters: Object.fromEntries(Object.entries(item.filters).map(([key, values]) => [key, [...values]])),
    details: item.details.map(detail => ({ ...detail })),
  }));
  const { panHandlers: swipeBackHandlers, swipeBackStyle } = useEdgeSwipeBack(onBack);
  useEffect(() => {
    setDraft({
      ...item,
      filters: Object.fromEntries(Object.entries(item.filters).map(([key, values]) => [key, [...values]])),
      details: item.details.map(detail => ({ ...detail })),
    });
  }, [item]);

  const tags = category.filters.flatMap(filter => item.filters[filter.key] || []);
  const isGeneral = category.key === 'generals';
  const isTeam = category.key === 'teams';
  const detailValues = new Map(item.details.map(detail => [detail.key, detail.value]));
  const genericDetails = isGeneral
    ? item.details.filter(detail => !GENERAL_STRUCTURED_KEYS.has(detail.key))
    : isTeam ? [] : item.details;
  const shortDetails = genericDetails.filter(detail => detail.value.length <= 42 && !/描述|文案|列传|效果|说明/.test(detail.key));
  const longDetails = genericDetails.filter(detail => detail.value.length > 42 || /描述|文案|列传|效果|说明/.test(detail.key));
  const icon = officialLibraryAssets[item.imageAssetKey];
  const artwork = officialLibraryAssets[item.artworkAssetKey];
  const teamMembers = isTeam ? readTeamMembers(item) : [];

  const saveDraft = () => {
    const name = draft.name.trim();
    if (!name) {
      Alert.alert('无法保存', '武将名称不能为空。');
      return;
    }
    onSave({
      ...draft,
      name,
      details: draft.details
        .map(detail => ({ key: detail.key.trim(), value: detail.value.trim() }))
        .filter(detail => detail.key),
    });
    setEditing(false);
  };

  const setDraftDetail = (key: string, value: string) => {
    setDraft(current => {
      const exists = current.details.some(detail => detail.key === key);
      return {
        ...current,
        details: exists
          ? current.details.map(detail => detail.key === key ? { ...detail, value } : detail)
          : [...current.details, { key, value }],
      };
    });
  };

  const resetItem = () => {
    Alert.alert('恢复官网数据？', `“${item.name}”的全部手动修改将被清除。`, [
      { text: '取消', style: 'cancel' },
      { text: '恢复', style: 'destructive', onPress: () => {
        onReset();
        setEditing(false);
      } },
    ]);
  };

  return (
    <View style={styles.swipeBackStage}>
    <AnimatedSafeAreaView style={[styles.safe, swipeBackStyle]} {...swipeBackHandlers}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Ionicons name="chevron-back" size={22} color="#3D322A" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.detailHeaderTitle} numberOfLines={1}>{item.name}</Text>
        </View>
        <Pressable style={styles.editDetailButton} onPress={() => editing ? saveDraft() : setEditing(true)}>
          <Ionicons name={editing ? 'checkmark' : 'create-outline'} size={16} color="#FFF9EF" />
          <Text style={styles.editDetailButtonText}>{editing ? '保存' : '编辑'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
        {editing ? (
          <View style={styles.editorSection}>
            <Text style={styles.editorTitle}>编辑本地资料</Text>

            <Text style={styles.editorLabel}>名称</Text>
            <TextInput
              value={draft.name}
              onChangeText={name => setDraft(current => ({ ...current, name }))}
              style={styles.editorInput}
              placeholder="武将名称"
              placeholderTextColor="#A89D92"
            />

            {isGeneral && (
              <View style={styles.tacticEditorBlock}>
                <Text style={styles.tacticEditorTitle}>战法更新</Text>
                <Text style={styles.editorLabel}>自带战法名称</Text>
                <TextInput
                  value={draft.details.find(detail => detail.key === '自带战法')?.value || ''}
                  onChangeText={value => setDraftDetail('自带战法', value)}
                  style={styles.editorInput}
                  placeholder="填写自带战法"
                  placeholderTextColor="#A89D92"
                />
                <View style={styles.tacticMetaEditorRow}>
                  {[
                    ['自带战法分类', '分类'],
                    ['自带战法目标', '目标'],
                    ['自带战法发动概率', '概率'],
                  ].map(([key, label]) => (
                    <View key={key} style={styles.tacticMetaEditorItem}>
                      <Text style={styles.editorLabel}>{label}</Text>
                      <TextInput
                        value={draft.details.find(detail => detail.key === key)?.value || ''}
                        onChangeText={value => setDraftDetail(key, value)}
                        style={styles.editorInput}
                        placeholder={label}
                        placeholderTextColor="#A89D92"
                      />
                    </View>
                  ))}
                </View>
                <Text style={styles.editorLabel}>自带战法描述</Text>
                <TextInput
                  value={draft.details.find(detail => detail.key === '自带战法描述')?.value || ''}
                  onChangeText={value => setDraftDetail('自带战法描述', value)}
                  style={styles.editorLongInput}
                  placeholder="填写自带战法完整描述"
                  placeholderTextColor="#A89D92"
                  multiline
                  textAlignVertical="top"
                />
                <Text style={styles.editorLabel}>传承战法名称</Text>
                <TextInput
                  value={draft.details.find(detail => detail.key === '传承战法')?.value || ''}
                  onChangeText={value => setDraftDetail('传承战法', value)}
                  style={styles.editorInput}
                  placeholder="填写传承战法"
                  placeholderTextColor="#A89D92"
                />
                <View style={styles.tacticMetaEditorRow}>
                  {[
                    ['传承战法分类', '分类'],
                    ['传承战法目标', '目标'],
                    ['传承战法发动概率', '概率'],
                  ].map(([key, label]) => (
                    <View key={key} style={styles.tacticMetaEditorItem}>
                      <Text style={styles.editorLabel}>{label}</Text>
                      <TextInput
                        value={draft.details.find(detail => detail.key === key)?.value || ''}
                        onChangeText={value => setDraftDetail(key, value)}
                        style={styles.editorInput}
                        placeholder={label}
                        placeholderTextColor="#A89D92"
                      />
                    </View>
                  ))}
                </View>
                <Text style={styles.editorLabel}>传承战法描述</Text>
                <TextInput
                  value={draft.details.find(detail => detail.key === '传承战法描述')?.value || ''}
                  onChangeText={value => setDraftDetail('传承战法描述', value)}
                  style={styles.editorLongInput}
                  placeholder="填写传承战法完整描述"
                  placeholderTextColor="#A89D92"
                  multiline
                  textAlignVertical="top"
                />
              </View>
            )}

            {isGeneral && (
              <View style={styles.growthEditorBlock}>
                <Text style={styles.tacticEditorTitle}>属性成长</Text>
                <View style={styles.growthEditorGrid}>
                  {GENERAL_ATTRIBUTES.map(attribute => {
                    const growthKey = `${attribute.key}成长`;
                    return (
                      <View key={growthKey} style={styles.growthEditorItem}>
                        <Text style={styles.editorLabel}>{attribute.label}成长</Text>
                        <TextInput
                          value={draft.details.find(detail => detail.key === growthKey)?.value || ''}
                          onChangeText={value => setDraftDetail(growthKey, value.replace(/[^0-9.]/g, ''))}
                          style={styles.editorInput}
                          placeholder="例如 1.19"
                          placeholderTextColor="#A89D92"
                          keyboardType="decimal-pad"
                        />
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {category.filters.map(filter => (
              <View key={filter.key}>
                <Text style={styles.editorLabel}>{filter.label}</Text>
                <TextInput
                  value={(draft.filters[filter.key] || []).join('、')}
                  onChangeText={value => setDraft(current => ({
                    ...current,
                    filters: {
                      ...current.filters,
                      [filter.key]: value.split(/[、,，]/).map(part => part.trim()).filter(Boolean),
                    },
                  }))}
                  style={styles.editorInput}
                  placeholder={`填写${filter.label}，多个值用顿号分隔`}
                  placeholderTextColor="#A89D92"
                />
              </View>
            ))}

            <View style={styles.editorFieldsHeader}>
              <Text style={styles.editorLabel}>{isGeneral ? '其他详情字段' : '详情字段'}</Text>
              <Pressable
                style={styles.addFieldButton}
                onPress={() => setDraft(current => ({
                  ...current,
                  details: [...current.details, { key: '', value: '' }],
                }))}
              >
                <Ionicons name="add" size={15} color="#A74433" />
                <Text style={styles.addFieldButtonText}>新增字段</Text>
              </Pressable>
            </View>

            {draft.details.map((detail, index) => ({ detail, index }))
              .filter(({ detail }) => !isGeneral || ![
                '自带战法',
                '自带战法分类',
                '自带战法目标',
                '自带战法发动概率',
                '自带战法描述',
                '传承战法',
                '传承战法分类',
                '传承战法目标',
                '传承战法发动概率',
                '传承战法描述',
                ...GENERAL_GROWTH_KEYS,
              ].includes(detail.key))
              .map(({ detail, index }) => (
              <View key={`${index}-${detail.key}`} style={styles.editorFieldCard}>
                <View style={styles.editorFieldHeader}>
                  <TextInput
                    value={detail.key}
                    onChangeText={key => setDraft(current => ({
                      ...current,
                      details: current.details.map((entry, entryIndex) => entryIndex === index ? { ...entry, key } : entry),
                    }))}
                    style={styles.editorKeyInput}
                    placeholder="字段名称"
                    placeholderTextColor="#A89D92"
                  />
                  <Pressable
                    style={styles.removeFieldButton}
                    onPress={() => setDraft(current => ({
                      ...current,
                      details: current.details.filter((_, entryIndex) => entryIndex !== index),
                    }))}
                  >
                    <Ionicons name="trash-outline" size={17} color="#B64D3C" />
                  </Pressable>
                </View>
                <TextInput
                  value={detail.value}
                  onChangeText={value => setDraft(current => ({
                    ...current,
                    details: current.details.map((entry, entryIndex) => entryIndex === index ? { ...entry, value } : entry),
                  }))}
                  style={styles.editorValueInput}
                  placeholder="字段内容"
                  placeholderTextColor="#A89D92"
                  multiline
                  textAlignVertical="top"
                />
              </View>
            ))}

            <Pressable style={styles.editorSaveButton} onPress={saveDraft}>
              <Text style={styles.editorSaveButtonText}>保存全部修改</Text>
            </Pressable>
            <Pressable style={styles.editorCancelButton} onPress={() => setEditing(false)}>
              <Text style={styles.editorCancelButtonText}>取消编辑</Text>
            </Pressable>
            {modified && (
              <Pressable style={styles.editorResetButton} onPress={resetItem}>
                <Ionicons name="refresh-outline" size={16} color="#B64D3C" />
                <Text style={styles.editorResetButtonText}>恢复官网原始数据</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <>
        {isTeam ? (
          <View style={styles.teamHeroCard}>
            <Text style={styles.teamHeroName}>{item.name}</Text>
            <View style={styles.teamScoreBadge}>
              <Text style={styles.teamScoreLabel}>天梯评分</Text>
              <Text style={styles.teamScoreValue}>{detailValues.get('评分') || '—'}</Text>
            </View>
          </View>
        ) : (
        <View style={styles.heroCard}>
          {artwork ? (
            <Image source={artwork} style={styles.artwork} resizeMode="contain" />
          ) : icon ? (
            <Image source={icon} style={styles.detailIcon} resizeMode="cover" />
          ) : (
            <View style={styles.detailFallback}><Text style={styles.detailFallbackText}>{item.name.slice(0, 1)}</Text></View>
          )}
          <Text style={styles.detailName}>{item.name}</Text>
          <View style={styles.detailTags}>
            {tags.map((tag, index) => <Text key={`${tag}-${index}`} style={styles.detailTag}>{tag}</Text>)}
          </View>
        </View>
        )}

        {isTeam && (
          <View style={styles.teamFormationCard}>
            <View style={styles.teamMembersRow}>
              {teamMembers.map((member, index) => {
                const generalItem = generalItemsByName.get(member.name);
                const memberImage = generalItem ? officialLibraryAssets[generalItem.imageAssetKey] : undefined;
                return (
                  <View key={`${member.name}-${index}`} style={styles.teamMemberColumn}>
                    <Text style={[styles.teamMemberRole, index === 0 && styles.teamMemberRoleMain]}>{member.role}</Text>
                    {memberImage ? (
                      <View style={styles.teamMemberImageFrame}>
                        <Image source={memberImage} style={styles.teamMemberImage} resizeMode="cover" />
                      </View>
                    ) : (
                      <View style={[styles.teamMemberImageFrame, styles.teamMemberFallback]}>
                        <Text style={styles.teamMemberFallbackText}>{member.name.slice(0, 1)}</Text>
                      </View>
                    )}
                    <Text style={styles.teamMemberName} numberOfLines={1}>{member.name}</Text>
                    <View style={styles.teamTacticsList}>
                      {member.tactics.split(/[+＋]/).map((tactic, tacticIndex) => (
                        <View key={`${tactic}-${tacticIndex}`} style={styles.teamTacticPill}>
                          <Text style={styles.teamTacticRank}>S</Text>
                          <Text style={styles.teamTacticText} numberOfLines={2}>{tactic}</Text>
                        </View>
                      ))}
                    </View>
                    {[
                      ['兵书', member.books],
                      ['加点', member.points],
                      ['装备', member.gear],
                      ...(member.note ? [['治军', member.note]] : []),
                    ].map(([label, value]) => (
                      <View key={label} style={styles.teamMemberMeta}>
                        <Text style={styles.teamMemberMetaLabel}>{label}</Text>
                        <Text style={styles.teamMemberMetaValue}>{value}</Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {isGeneral && (
          <>
            <View style={styles.generalStatsSection}>
              <Text style={styles.sectionTitle}>武将属性</Text>
              <Text style={styles.statsGroupLabel}>兵种适性</Text>
              <View style={styles.troopRow}>
                {TROOP_TYPES.map(troop => {
                  const grade = detailValues.get(troop.key) || '—';
                  const gradeStyle = grade === 'S'
                    ? styles.troopGradeS
                    : grade === 'A'
                      ? styles.troopGradeA
                      : grade === 'B'
                        ? styles.troopGradeB
                        : styles.troopGradeC;
                  return (
                    <View key={troop.key} style={[styles.troopBadge, gradeStyle]}>
                      <Ionicons name={troop.icon} size={16} color="#FFF8EC" />
                      <Text style={styles.troopName}>{troop.label}</Text>
                      <Text style={styles.troopGrade}>{grade}</Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.statsDivider} />
              <View style={styles.attributeGrid}>
                {GENERAL_ATTRIBUTES.map(attribute => (
                  <View key={attribute.key} style={styles.attributeItem}>
                    <Ionicons name={attribute.icon} size={19} color="#B58338" />
                    <Text style={styles.attributeName}>{attribute.label}</Text>
                    <View style={styles.attributeNumberGroup}>
                      <Text style={styles.attributeValue}>{detailValues.get(attribute.key) || '—'}</Text>
                      <Text style={styles.attributeGrowth}>（+{detailValues.get(`${attribute.key}成长`) || '—'}）</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {[
              {
                type: '自带战法',
                name: detailValues.get('自带战法'),
                category: detailValues.get('自带战法分类'),
                target: detailValues.get('自带战法目标'),
                rate: detailValues.get('自带战法发动概率'),
                description: detailValues.get('自带战法描述'),
              },
              {
                type: '传承战法',
                name: detailValues.get('传承战法'),
                category: detailValues.get('传承战法分类'),
                target: detailValues.get('传承战法目标'),
                rate: detailValues.get('传承战法发动概率'),
                description: detailValues.get('传承战法描述'),
              },
            ].map(tactic => (
              <View key={tactic.type} style={styles.tacticSection}>
                <Text style={styles.tacticType}>{tactic.type}</Text>
                <Text style={styles.tacticName}>{tactic.name || '暂无'}</Text>
                <View style={styles.tacticMetaRow}>
                  {[tactic.category, tactic.target, tactic.rate].filter(Boolean).map(value => (
                    <Text key={value} style={styles.tacticMetaTag}>{value}</Text>
                  ))}
                </View>
                {tactic.description ? <Text style={styles.tacticDescription}>{tactic.description}</Text> : null}
              </View>
            ))}
          </>
        )}

        {shortDetails.length > 0 && (
          <View style={styles.detailSection}>
            <Text style={styles.sectionTitle}>{isGeneral ? '其他资料' : '资料属性'}</Text>
            {shortDetails.map((detail, index) => (
              <View key={`${detail.key}-${index}`} style={[styles.detailRow, index > 0 && styles.detailRowBorder]}>
                <Text style={styles.detailKey}>{detail.key}</Text>
                <Text style={styles.detailValue}>{detail.value}</Text>
              </View>
            ))}
          </View>
        )}

        {longDetails.map((detail, index) => (
          <View key={`${detail.key}-${index}`} style={styles.detailSection}>
            <Text style={styles.sectionTitle}>{detail.key}</Text>
            <Text style={styles.detailParagraph}>{detail.value}</Text>
          </View>
        ))}

          </>
        )}
      </ScrollView>
    </AnimatedSafeAreaView>
    </View>
  );
}

export default function LibraryScreen({
  onBack,
  onLibraryUpdated,
  initialItemId,
}: {
  onBack: () => void;
  onLibraryUpdated?: (overrides: LibraryOverrides) => void;
  initialItemId?: string | null;
}) {
  const initialCategoryKey = library.categories.find(category => category.items.some(item => item.id === initialItemId))?.key;
  const [categoryKey, setCategoryKey] = useState(initialCategoryKey || library.categories[0].key);
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
  const [selectedItemId, setSelectedItemId] = useState<string | null>(initialItemId || null);
  const [overrides, setOverrides] = useState<LibraryOverrides>({});
  const { panHandlers: swipeBackHandlers, swipeBackStyle } = useEdgeSwipeBack(onBack);

  useEffect(() => {
    AsyncStorage.getItem(LIBRARY_OVERRIDES_KEY)
      .then(value => {
        if (!value) return;
        const parsed: unknown = JSON.parse(value);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
        const stored = parsed as LibraryOverrides;
        setOverrides(stored);
        onLibraryUpdated?.(stored);
      })
      .catch(() => undefined);
  }, [onLibraryUpdated]);

  const categories = useMemo(() => library.categories.map(baseCategory => ({
    ...baseCategory,
    items: baseCategory.items.map(item => {
      const override = overrides[item.id];
      return override ? {
        ...item,
        name: override.name,
        filters: override.filters,
        details: override.details,
      } : item;
    }),
  })), [overrides]);

  const category = categories.find(item => item.key === categoryKey) || categories[0];
  const selectedItem = selectedItemId ? category.items.find(item => item.id === selectedItemId) || null : null;
  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('zh-CN');
    return category.items.filter(item => {
      const searchableText = category.key === 'teams'
        ? [item.name, ...item.details.map(detail => detail.value)].join(' ')
        : item.name;
      if (keyword && !searchableText.toLocaleLowerCase('zh-CN').includes(keyword)) return false;
      return Object.entries(activeFilters).every(([key, values]) =>
        values.length === 0 || values.some(value => item.filters[key]?.includes(value)),
      );
    });
  }, [activeFilters, category, query]);

  const selectCategory = (key: string) => {
    setCategoryKey(key);
    setActiveFilters({});
    setQuery('');
    setSelectedItemId(null);
  };

  const persistOverrides = (next: LibraryOverrides) => {
    setOverrides(next);
    onLibraryUpdated?.(next);
    AsyncStorage.setItem(LIBRARY_OVERRIDES_KEY, JSON.stringify(next)).catch(() => {
      Alert.alert('保存失败', '无法将资料修改写入手机存储。');
    });
  };

  const saveLibraryItem = (updatedItem: LibraryItem) => {
    const next = {
      ...overrides,
      [updatedItem.id]: {
        name: updatedItem.name,
        filters: updatedItem.filters,
        details: updatedItem.details,
      },
    };
    persistOverrides(next);
  };

  const resetLibraryItem = (itemId: string) => {
    const next = { ...overrides };
    delete next[itemId];
    persistOverrides(next);
  };

  const toggleFilter = (key: string, value: string) => {
    setActiveFilters(current => {
      const selected = current[key] || [];
      if (key === 'source') {
        const nextValues = selected.includes(value)
          ? selected.filter(item => item !== value)
          : [...selected, value];
        const next = { ...current };
        if (nextValues.length) next[key] = nextValues;
        else delete next[key];
        return next;
      }
      if (selected.includes(value)) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: [value] };
    });
  };

  const renderItem = ({ item }: { item: LibraryItem }) => {
    if (category.key === 'teams') {
      const members = readTeamMembers(item);
      const score = item.details.find(detail => detail.key === '评分')?.value || '—';
      return (
        <Pressable style={styles.teamListCard} onPress={() => setSelectedItemId(item.id)}>
          <View style={styles.teamListHeader}>
            <Text style={styles.teamListName}>{item.name}</Text>
            <View style={styles.teamListScoreBadge}>
              <Text style={styles.teamListScore}>{score}</Text>
            </View>
          </View>
          <View style={styles.teamListMembers}>
            {members.map(member => {
              const generalItem = generalItemsByName.get(member.name);
              const image = generalItem ? officialLibraryAssets[generalItem.imageAssetKey] : undefined;
              return (
                <View key={member.name} style={styles.teamListMember}>
                  {image ? (
                    <Image source={image} style={styles.teamListAvatar} resizeMode="cover" />
                  ) : (
                    <View style={[styles.teamListAvatar, styles.teamMemberFallback]}>
                      <Text style={styles.teamListAvatarText}>{member.name.slice(0, 1)}</Text>
                    </View>
                  )}
                  <Text style={styles.teamListMemberName} numberOfLines={1}>{member.name}</Text>
                </View>
              );
            })}
          </View>
        </Pressable>
      );
    }
    const tags = category.filters
      .flatMap(filter => item.filters[filter.key] || [])
      .slice(0, 3);
    return (
      <Pressable style={styles.itemCard} onPress={() => setSelectedItemId(item.id)}>
        {officialLibraryAssets[item.imageAssetKey] ? (
          <Image source={officialLibraryAssets[item.imageAssetKey]} style={styles.itemImage} resizeMode="cover" />
        ) : (
          <View style={styles.itemFallback}><Text style={styles.itemFallbackText}>{item.name.slice(0, 1)}</Text></View>
        )}
        <View style={styles.itemBody}>
          <Text style={styles.itemName}>{item.name}</Text>
          <View style={styles.tagRow}>
            {tags.map((tag, index) => <Text key={`${tag}-${index}`} style={styles.tag}>{tag}</Text>)}
          </View>
        </View>
        <View style={styles.officialMark}>
          <Text style={styles.officialText}>详情</Text>
          <Ionicons name="chevron-forward" size={14} color="#A74433" />
        </View>
      </Pressable>
    );
  };

  if (selectedItem) {
    return (
      <LibraryDetail
        item={selectedItem}
        category={category}
        modified={Boolean(overrides[selectedItem.id])}
        onBack={() => initialItemId ? onBack() : setSelectedItemId(null)}
        onSave={saveLibraryItem}
        onReset={() => resetLibraryItem(selectedItem.id)}
      />
    );
  }

  return (
    <View style={styles.swipeBackStage}>
    <AnimatedSafeAreaView style={[styles.safe, swipeBackStyle]} {...swipeBackHandlers}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Ionicons name="chevron-back" size={22} color="#3D322A" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>三战资料库</Text>
        </View>
        <View style={styles.countBadge}><Text style={styles.countText}>{filteredItems.length}</Text></View>
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={(
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
              {categories.map(item => (
                <Pressable
                  key={item.key}
                  style={[styles.categoryTab, categoryKey === item.key && styles.categoryTabActive]}
                  onPress={() => selectCategory(item.key)}
                >
                  <Text style={[styles.categoryText, categoryKey === item.key && styles.categoryTextActive]}>{item.label}</Text>
                  <Text style={[styles.categoryCount, categoryKey === item.key && styles.categoryCountActive]}>{item.items.length}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color="#9C9085" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={`搜索${category.label.replace('库', '')}`}
                placeholderTextColor="#A89D92"
                style={styles.searchInput}
                clearButtonMode="while-editing"
              />
            </View>

            {category.filters.map(filter => (
              <View key={filter.key} style={styles.filterGroup}>
                <Text style={styles.filterLabel}>{filter.label}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  <Pressable
                    style={[styles.filterChip, !activeFilters[filter.key]?.length && styles.filterChipActive]}
                    onPress={() => setActiveFilters(current => {
                      const next = { ...current };
                      delete next[filter.key];
                      return next;
                    })}
                  >
                    <Text style={[styles.filterText, !activeFilters[filter.key]?.length && styles.filterTextActive]}>全部</Text>
                  </Pressable>
                  {filter.options.map(option => (
                    <Pressable
                      key={option}
                      style={[styles.filterChip, activeFilters[filter.key]?.includes(option) && styles.filterChipActive]}
                      onPress={() => toggleFilter(filter.key, option)}
                    >
                      <Text style={[styles.filterText, activeFilters[filter.key]?.includes(option) && styles.filterTextActive]}>{option}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ))}

            <View style={styles.resultHeader}>
              <Text style={styles.resultTitle}>{category.label}</Text>
              <Text style={styles.resultMeta}>{filteredItems.length} 条</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={26} color="#A89C91" />
            <Text style={styles.emptyTitle}>没有找到匹配资料</Text>
          </View>
        )}
        ListFooterComponent={(
          <View style={styles.sourceCard}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#A74433" />
            <View style={styles.sourceCopy}>
              <Text style={styles.sourceTitle}>数据来源：三国志・战略版官网资料库</Text>
            </View>
          </View>
        )}
      />
    </AnimatedSafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  swipeBackStage: { flex: 1, backgroundColor: '#F5F1E8', overflow: 'hidden' },
  safe: { flex: 1, backgroundColor: '#F5F1E8' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 16 },
  backButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E9E2D7', alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, marginLeft: 12 },
  eyebrow: { color: '#A74433', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#2E261F', fontSize: 24, fontWeight: '800', marginTop: 2 },
  detailHeaderTitle: { color: '#2E261F', fontSize: 22, fontWeight: '800', marginTop: 2 },
  editDetailButton: { height: 34, borderRadius: 17, paddingHorizontal: 11, backgroundColor: '#A74433', flexDirection: 'row', alignItems: 'center', gap: 4 },
  editDetailButtonText: { color: '#FFF9EF', fontSize: 13, fontWeight: '800' },
  localBadge: { height: 32, borderRadius: 16, paddingHorizontal: 10, backgroundColor: '#E9E2D7', flexDirection: 'row', alignItems: 'center', gap: 4 },
  localBadgeText: { color: '#A74433', fontSize: 10, fontWeight: '800' },
  countBadge: { minWidth: 44, height: 32, borderRadius: 16, paddingHorizontal: 10, backgroundColor: '#E9E2D7', alignItems: 'center', justifyContent: 'center' },
  countText: { color: '#55493F', fontSize: 12, fontWeight: '800' },
  listContent: { paddingHorizontal: 18, paddingBottom: 34 },
  categoryRow: { gap: 9, paddingRight: 18, marginBottom: 15 },
  categoryTab: { height: 48, minWidth: 92, borderRadius: 16, backgroundColor: '#E9E2D7', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  categoryTabActive: { backgroundColor: '#382C24' },
  categoryText: { color: '#70645A', fontSize: 14, fontWeight: '700' },
  categoryTextActive: { color: '#FFF9EF' },
  categoryCount: { color: '#A3978C', fontSize: 10, fontWeight: '700' },
  categoryCountActive: { color: '#D2C4B3' },
  searchBox: { height: 50, backgroundColor: '#FFFDF8', borderRadius: 15, borderWidth: 1, borderColor: '#E6DDD2', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 17 },
  searchInput: { flex: 1, color: '#332A23', fontSize: 14, marginLeft: 8, paddingVertical: 0 },
  filterGroup: { marginBottom: 14 },
  filterLabel: { color: '#7F7267', fontSize: 11, fontWeight: '700', marginBottom: 7 },
  filterRow: { gap: 7, paddingRight: 18 },
  filterChip: { height: 31, minWidth: 49, borderRadius: 15.5, paddingHorizontal: 12, backgroundColor: '#EAE3D9', alignItems: 'center', justifyContent: 'center' },
  filterChipActive: { backgroundColor: '#A74433' },
  filterText: { color: '#766A60', fontSize: 11, fontWeight: '600' },
  filterTextActive: { color: '#FFF9EF' },
  resultHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 7, marginBottom: 10, paddingHorizontal: 2 },
  resultTitle: { color: '#332A23', fontSize: 18, fontWeight: '800' },
  resultMeta: { color: '#A0958B', fontSize: 10 },
  itemCard: { minHeight: 72, backgroundColor: '#FFFDF8', borderRadius: 17, borderWidth: 1, borderColor: '#E8DFD4', padding: 10, marginBottom: 9, flexDirection: 'row', alignItems: 'center' },
  itemImage: { width: 52, height: 52, borderRadius: 13, backgroundColor: '#E9E1D5' },
  itemFallback: { width: 52, height: 52, borderRadius: 13, backgroundColor: '#C99741', alignItems: 'center', justifyContent: 'center' },
  itemFallbackText: { color: '#FFF9EF', fontSize: 21, fontWeight: '800' },
  itemBody: { flex: 1, marginLeft: 12 },
  itemName: { color: '#342B24', fontSize: 16, fontWeight: '800' },
  teamListCard: { minHeight: 132, backgroundColor: '#FFFDF8', borderRadius: 18, borderWidth: 1, borderColor: '#E3D5C2', padding: 13, marginBottom: 10 },
  teamListHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  teamListName: { color: '#342B24', fontSize: 18, fontWeight: '900' },
  teamListScoreBadge: { minWidth: 48, height: 28, paddingHorizontal: 9, borderRadius: 14, backgroundColor: '#A74433', alignItems: 'center', justifyContent: 'center' },
  teamListScore: { color: '#FFF8EA', fontSize: 12, fontWeight: '900' },
  teamListMembers: { flexDirection: 'row', gap: 10 },
  teamListMember: { flex: 1, minWidth: 0, alignItems: 'center' },
  teamListAvatar: { width: 52, height: 52, borderRadius: 13, backgroundColor: '#E9E1D5' },
  teamListAvatarText: { color: '#FFF9EF', fontSize: 18, fontWeight: '900' },
  teamListMemberName: { color: '#5A4A3E', fontSize: 12, fontWeight: '800', marginTop: 6, maxWidth: '100%' },
  tagRow: { flexDirection: 'row', gap: 5, marginTop: 7 },
  tag: { color: '#8F7F72', fontSize: 10, backgroundColor: '#F0E9DF', borderRadius: 7, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3 },
  officialMark: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 7 },
  officialText: { color: '#A74433', fontSize: 10, fontWeight: '700' },
  empty: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: '#6E6258', fontSize: 14, fontWeight: '700', marginTop: 10 },
  emptyText: { color: '#A3988E', fontSize: 11, marginTop: 5 },
  sourceCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EDE6DC', borderRadius: 15, padding: 13, marginTop: 12 },
  sourceCopy: { flex: 1, marginHorizontal: 9 },
  sourceTitle: { color: '#675A50', fontSize: 11, fontWeight: '700' },
  sourceText: { color: '#9E9288', fontSize: 9, marginTop: 3 },
  detailContent: { paddingHorizontal: 18, paddingBottom: 36 },
  editorSection: { backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#E8DFD3', borderRadius: 20, padding: 16 },
  editorTitle: { color: '#332A23', fontSize: 20, fontWeight: '800' },
  editorHint: { color: '#978A7F', fontSize: 13, lineHeight: 20, marginTop: 5, marginBottom: 17 },
  editorLabel: { color: '#675A50', fontSize: 14, fontWeight: '800', marginBottom: 7, marginTop: 12 },
  editorInput: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#DED3C6', backgroundColor: '#F8F3EB', color: '#342B24', fontSize: 16, paddingHorizontal: 12, paddingVertical: 10 },
  editorLongInput: { minHeight: 122, borderRadius: 12, borderWidth: 1, borderColor: '#DED3C6', backgroundColor: '#F8F3EB', color: '#342B24', fontSize: 15, lineHeight: 24, paddingHorizontal: 12, paddingVertical: 11 },
  tacticEditorBlock: { borderRadius: 16, borderWidth: 1, borderColor: '#D8C2A2', backgroundColor: '#F5EBDD', padding: 13, marginTop: 17 },
  growthEditorBlock: { borderRadius: 16, borderWidth: 1, borderColor: '#D4DDD1', backgroundColor: '#EEF3EC', padding: 13, marginTop: 12 },
  growthEditorGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  growthEditorItem: { width: '48%' },
  tacticMetaEditorRow: { flexDirection: 'row', justifyContent: 'space-between' },
  tacticMetaEditorItem: { width: '31%' },
  tacticEditorTitle: { color: '#A74433', fontSize: 16, fontWeight: '900', marginBottom: 2 },
  editorFieldsHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8 },
  addFieldButton: { height: 30, borderRadius: 15, paddingHorizontal: 9, borderWidth: 1, borderColor: '#D9BEB5', flexDirection: 'row', alignItems: 'center', gap: 3 },
  addFieldButtonText: { color: '#A74433', fontSize: 10, fontWeight: '800' },
  editorFieldCard: { borderRadius: 14, borderWidth: 1, borderColor: '#E3D9CD', backgroundColor: '#FAF6EF', padding: 10, marginTop: 9 },
  editorFieldHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editorKeyInput: { flex: 1, height: 44, borderRadius: 10, backgroundColor: '#EEE6DB', color: '#4C4037', fontSize: 14, fontWeight: '700', paddingHorizontal: 10 },
  removeFieldButton: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#F3E3DF', alignItems: 'center', justifyContent: 'center' },
  editorValueInput: { minHeight: 82, borderRadius: 10, backgroundColor: '#FFFDF8', color: '#4F4239', fontSize: 15, lineHeight: 23, paddingHorizontal: 10, paddingVertical: 10, marginTop: 8 },
  editorSaveButton: { height: 48, borderRadius: 14, backgroundColor: '#A74433', alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  editorSaveButtonText: { color: '#FFF9EF', fontSize: 14, fontWeight: '900' },
  editorCancelButton: { height: 44, borderRadius: 14, backgroundColor: '#EDE6DC', alignItems: 'center', justifyContent: 'center', marginTop: 9 },
  editorCancelButtonText: { color: '#665A50', fontSize: 13, fontWeight: '800' },
  editorResetButton: { height: 44, borderRadius: 14, borderWidth: 1, borderColor: '#DDBEB7', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 9 },
  editorResetButtonText: { color: '#B64D3C', fontSize: 12, fontWeight: '800' },
  heroCard: { minHeight: 190, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#E8DFD3', borderRadius: 22, padding: 18, alignItems: 'center', overflow: 'hidden' },
  teamHeroCard: { minHeight: 88, borderRadius: 20, paddingHorizontal: 18, backgroundColor: '#2A231D', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  teamHeroName: { color: '#FFF5E3', fontSize: 25, fontWeight: '900', flex: 1 },
  teamScoreBadge: { minWidth: 72, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, backgroundColor: '#A74433', alignItems: 'center' },
  teamScoreLabel: { color: '#EBCBB8', fontSize: 9, fontWeight: '700' },
  teamScoreValue: { color: '#FFF8E8', fontSize: 18, fontWeight: '900', marginTop: 2 },
  teamFormationCard: { backgroundColor: '#1F1C18', borderRadius: 18, padding: 8, marginTop: 12, overflow: 'hidden' },
  teamMembersRow: { flexDirection: 'row', gap: 5, alignItems: 'flex-start' },
  teamMemberColumn: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: '#4B4233', borderRadius: 10, padding: 5, backgroundColor: '#24211C' },
  teamMemberRole: { height: 23, color: '#C8B99A', fontSize: 11, fontWeight: '800', textAlign: 'center', textAlignVertical: 'center', borderWidth: 1, borderColor: '#625845', borderRadius: 4, paddingTop: 3 },
  teamMemberRoleMain: { color: '#F1B545' },
  teamMemberImageFrame: {
    width: 72,
    height: 72,
    alignSelf: 'center',
    borderRadius: 36,
    backgroundColor: '#3C352C',
    marginTop: 8,
    overflow: 'hidden',
  },
  teamMemberImage: { width: '100%', height: '100%' },
  teamMemberFallback: { backgroundColor: '#A74433', alignItems: 'center', justifyContent: 'center' },
  teamMemberFallbackText: { color: '#FFF8E8', fontSize: 28, fontWeight: '900' },
  teamMemberName: { color: '#F4C45D', fontSize: 14, fontWeight: '900', textAlign: 'center', marginTop: 6 },
  teamTacticsList: { gap: 4, marginTop: 7 },
  teamTacticPill: { minHeight: 30, borderWidth: 1, borderColor: '#554B38', borderRadius: 14, paddingHorizontal: 5, flexDirection: 'row', alignItems: 'center' },
  teamTacticRank: { width: 19, height: 19, borderRadius: 10, color: '#E1B957', borderWidth: 1, borderColor: '#78643C', fontSize: 10, fontWeight: '900', textAlign: 'center', paddingTop: 2, marginRight: 4 },
  teamTacticText: { color: '#E4D4B5', fontSize: 10, lineHeight: 13, fontWeight: '700', flex: 1 },
  teamMemberMeta: { borderTopWidth: 1, borderTopColor: '#403A30', paddingTop: 5, marginTop: 6 },
  teamMemberMetaLabel: { color: '#B88942', fontSize: 9, fontWeight: '800' },
  teamMemberMetaValue: { color: '#D8CCB6', fontSize: 10, lineHeight: 14, fontWeight: '600', marginTop: 2 },
  artwork: { width: '100%', height: 260, marginTop: -8 },
  detailIcon: { width: 96, height: 96, borderRadius: 24, backgroundColor: '#E9E1D5', marginTop: 4 },
  detailFallback: { width: 96, height: 96, borderRadius: 24, backgroundColor: '#C99741', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  detailFallbackText: { color: '#FFF9EF', fontSize: 36, fontWeight: '800' },
  detailName: { color: '#302720', fontSize: 28, fontWeight: '800', marginTop: 12 },
  detailTags: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 10 },
  detailTag: { color: '#8A796C', fontSize: 13, backgroundColor: '#EFE7DC', borderRadius: 9, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5 },
  detailSection: { backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#E8DFD3', borderRadius: 18, padding: 16, marginTop: 12 },
  sectionTitle: { color: '#372D25', fontSize: 19, fontWeight: '800', marginBottom: 12 },
  generalStatsSection: { backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#E8DFD3', borderRadius: 18, padding: 16, marginTop: 12 },
  statsGroupLabel: { color: '#8A6B39', fontSize: 14, fontWeight: '800', marginBottom: 10 },
  troopRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  troopBadge: { width: '18.4%', height: 38, borderRadius: 8, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: '#70819A' },
  troopGradeS: { backgroundColor: '#B96732' },
  troopGradeA: { backgroundColor: '#8B5B91' },
  troopGradeB: { backgroundColor: '#657D9C' },
  troopGradeC: { backgroundColor: '#77746F' },
  troopName: { color: '#FFF8EC', fontSize: 11, fontWeight: '700' },
  troopGrade: { color: '#FFF8EC', fontSize: 14, fontWeight: '900' },
  statsDivider: { height: 1, backgroundColor: '#E9DFD2', marginVertical: 14 },
  attributeGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  attributeItem: { width: '48%', minHeight: 52, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#EFE7DC' },
  attributeName: { color: '#796A5E', fontSize: 14, fontWeight: '700', marginLeft: 6 },
  attributeNumberGroup: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'baseline' },
  attributeValue: { color: '#342B24', fontSize: 18, fontWeight: '800' },
  attributeGrowth: { color: '#4D9A6A', fontSize: 12, fontWeight: '800', marginLeft: 2 },
  tacticSection: { backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#E8DFD3', borderRadius: 18, padding: 16, marginTop: 12 },
  tacticType: { color: '#A74433', fontSize: 13, fontWeight: '800' },
  tacticName: { color: '#352C25', fontSize: 21, fontWeight: '800', marginTop: 5 },
  tacticMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  tacticMetaTag: { color: '#8D6228', backgroundColor: '#F4E9D7', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5, fontSize: 13, fontWeight: '700' },
  tacticDescription: { color: '#6F6055', fontSize: 15, lineHeight: 25, marginTop: 11 },
  detailRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  detailRowBorder: { borderTopWidth: 1, borderTopColor: '#EFE7DC' },
  detailKey: { color: '#8A7D72', fontSize: 14, flexShrink: 1 },
  detailValue: { color: '#40352D', fontSize: 15, fontWeight: '700', textAlign: 'right', flex: 1 },
  detailParagraph: { color: '#66584D', fontSize: 15, lineHeight: 26 },
  localSourceCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EDE6DC', borderRadius: 15, padding: 13, marginTop: 12 },
});
