import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Share from 'react-native-share';
import Svg, { Path } from 'react-native-svg';
import LibraryScreen, { LIBRARY_OVERRIDES_KEY, LibraryOverrides } from './LibraryScreen';
import officialLibrary from './data/official-library.json';
import { officialLibraryAssets } from './data/official-library-assets';
import {
  Alert,
  Animated,
  FlatList,
  Image,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Draw = {
  id: string;
  general: string;
  season: string;
  createdAt: string;
  drawNumber?: number;
  isCore?: boolean;
  isRecruit?: boolean;
};

type GeneralOption = {
  id: string;
  name: string;
  faction: string;
  imageAssetKey: string;
};

type ErrorBoundaryState = {
  error: string | null;
};

type PendingDayAction =
  | { type: 'create'; dateKey: string }
  | { type: 'edit'; drawId: string }
  | null;

type SealIconProps = {
  name: React.ComponentProps<typeof Ionicons>['name'];
  size?: number;
  containerSize?: number;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
};

type CalendarActionIconProps = {
  name: 'stats' | 'export' | 'library';
  size?: number;
  containerSize?: number;
};

const CALENDAR_ACTION_ICON_PATHS: Record<CalendarActionIconProps['name'], string> = {
  stats: 'M3 3H21C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3ZM7 13V17H9V13H7ZM11 7V17H13V7H11ZM15 10V17H17V10H15Z',
  export: 'M16 2L21 7V21.0082C21 21.556 20.5551 22 20.0066 22H3.9934C3.44476 22 3 21.5447 3 21.0082V2.9918C3 2.44405 3.44495 2 3.9934 2H16ZM13 12V8H11V12H8L12 16L16 12H13Z',
  library: 'M21 18H6C5.44772 18 5 18.4477 5 19C5 19.5523 5.44772 20 6 20H21V22H6C4.34315 22 3 20.6569 3 19V4C3 2.89543 3.89543 2 5 2H21V18ZM16 9V7H8V9H16Z',
};

function CalendarActionIcon({ name, size = 18, containerSize = 32 }: CalendarActionIconProps) {
  return (
    <View style={[styles.sealIconFrame, { width: containerSize, height: containerSize }]}> 
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={CALENDAR_ACTION_ICON_PATHS[name]} fill="#A74433" />
      </Svg>
    </View>
  );
}

function SealIcon({
  name,
  size = 18,
  containerSize = 38,
  color = '#A74433',
  backgroundColor = '#F3E8DA',
}: SealIconProps) {
  const solidName = String(name).replace(/-outline$/, '') as React.ComponentProps<typeof Ionicons>['name'];
  const iconSize = Math.max(size, Math.round(containerSize * 0.58));
  const iconColor = color.toUpperCase().startsWith('#FFF') ? backgroundColor : color;
  return (
    <View style={[styles.sealIconFrame, { width: containerSize, height: containerSize }]}> 
      <Ionicons name={solidName} size={iconSize} color={iconColor} />
    </View>
  );
}

const SEASON_MANAGE_ROW_HEIGHT = 66;

type SeasonManageRowProps = {
  item: string;
  index: number;
  total: number;
  selected: boolean;
  recordCount: number;
  onSelect: () => void;
  onDelete: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
};

function SeasonManageRow({
  item,
  index,
  total,
  selected,
  recordCount,
  onSelect,
  onDelete,
  onReorder,
}: SeasonManageRowProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const [dragging, setDragging] = useState(false);
  const indexRef = useRef(index);
  const totalRef = useRef(total);
  const reorderRef = useRef(onReorder);

  useEffect(() => {
    indexRef.current = index;
    totalRef.current = total;
    reorderRef.current = onReorder;
  }, [index, total, onReorder]);

  const dragGesture = useMemo(() => Gesture.Pan()
    .activateAfterLongPress(350)
    .minDistance(2)
    .runOnJS(true)
    .onStart(() => {
      setDragging(true);
      translateY.stopAnimation();
    })
    .onUpdate(event => {
      translateY.setValue(event.translationY);
    })
    .onEnd(event => {
      const fromIndex = indexRef.current;
      const rawTarget = fromIndex + Math.round(event.translationY / SEASON_MANAGE_ROW_HEIGHT);
      const toIndex = Math.max(0, Math.min(totalRef.current - 1, rawTarget));
      if (toIndex !== fromIndex) reorderRef.current(fromIndex, toIndex);
    })
    .onFinalize(() => {
      setDragging(false);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
    }), [translateY]);

  return (
    <Animated.View
      style={[
        styles.seasonManageRow,
        index > 0 && styles.recordDivider,
        dragging && styles.seasonManageRowDragging,
        { transform: [{ translateY }] },
      ]}
    >
      <Pressable style={styles.seasonManageSelect} onPress={onSelect}>
        <SealIcon
          name={selected ? 'checkmark' : 'flag-outline'}
          size={14}
          containerSize={34}
          color={selected ? '#FFF9EE' : '#A74433'}
          backgroundColor={selected ? '#A74433' : '#F1E9DF'}
        />
        <View>
          <Text style={styles.seasonManageName}>{item}</Text>
          <Text style={styles.seasonManageCount}>{recordCount} 条抽卡记录</Text>
        </View>
      </Pressable>
      <GestureDetector gesture={dragGesture}>
        <Animated.View
          accessibilityLabel={`拖拽排序${item}`}
          accessibilityHint="长按后上下拖动排序"
          style={[styles.seasonDragHandle, dragging && styles.seasonDragHandleActive]}
        >
          <Ionicons name="reorder-three" size={24} color={dragging ? '#FFF9EE' : '#7D6F64'} />
        </Animated.View>
      </GestureDetector>
      <Pressable style={styles.deleteSeasonButton} onPress={onDelete}>
        <Ionicons name="trash-outline" size={18} color="#B64D3C" />
      </Pressable>
    </Animated.View>
  );
}

const STORAGE_KEY = 'sanguo.draws.v1';
const SEASONS_STORAGE_KEY = 'sanguo.seasons.v1';
const DRAW_NUMBER_ACCESSORY_ID = 'draw-number-keyboard-toolbar';
const DEFAULT_SEASONS = ['S1', 'S2', 'S3'];
const GENERAL_FACTION_ORDER = ['魏', '蜀', '吴', '群', '汉'];
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const SAMPLE_DRAWS: Draw[] = [
  { id: '1', general: '诸葛亮', season: 'S1', createdAt: '2026-08-06T09:42:00.000+08:00' },
  { id: '2', general: '张飞', season: 'S1', createdAt: '2026-08-05T21:18:00.000+08:00' },
  { id: '3', general: '郭淮', season: 'S1', createdAt: '2026-08-05T21:17:00.000+08:00' },
];
const GENERAL_OPTIONS: GeneralOption[] = (() => {
  const category = officialLibrary.categories.find(item => item.key === 'generals');
  if (!category) return [];
  return (category.items as Array<{
    id: string;
    name: string;
    filters: Record<string, string[]>;
    imageAssetKey: string;
  }>).map(item => ({
    id: item.id,
    name: item.name,
    faction: item.filters.faction?.[0] || '其他',
    imageAssetKey: item.imageAssetKey,
  }));
})();
const normalizeStoredDraws = (value: string): Draw[] => {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return SAMPLE_DRAWS;

  return parsed.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    const generalValue = item.general ?? item.generalName ?? item.character ?? item.name;
    const general = typeof generalValue === 'string' ? generalValue.trim() : '';
    if (!general) return [];

    const dateValue = item.createdAt ?? item.drawAt ?? item.timestamp ?? item.date;
    const date = new Date(typeof dateValue === 'number' || typeof dateValue === 'string' ? dateValue : Date.now());
    if (Number.isNaN(date.getTime())) return [];

    return [{
      id: typeof item.id === 'string' || typeof item.id === 'number'
        ? String(item.id)
        : `migrated-${date.getTime()}-${index}`,
      general,
      season: typeof item.season === 'string' && item.season.trim() ? item.season.trim() : 'S1',
      createdAt: date.toISOString(),
      drawNumber: typeof (item.drawNumber ?? item.pullNumber) === 'number'
        ? Math.max(1, Math.floor(item.drawNumber as number ?? item.pullNumber as number))
        : undefined,
      isCore: item.isCore === true || item.core === true,
      isRecruit: item.isRecruit === true || item.recruit === true,
    }];
  });
};

class AppErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error: error.message || '未知错误' };
  }

  componentDidCatch(error: Error) {
    console.error('App render failed', error);
  }

  render() {
    if (this.state.error) {
      return (
        <SafeAreaView style={styles.fallbackSafe}>
          <StatusBar style="dark" />
          <View style={styles.fallbackCard}>
            <Ionicons name="alert-circle-outline" size={34} color="#A74433" />
            <Text style={styles.fallbackTitle}>页面加载失败</Text>
            <Text style={styles.fallbackText}>{this.state.error}</Text>
            <Pressable style={styles.fallbackButton} onPress={() => this.setState({ error: null })}>
              <Text style={styles.fallbackButtonText}>重试</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

const pad = (value: number) => `${value}`.padStart(2, '0');
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const monthTitle = (date: Date) => `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
const dateTitle = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return `${month} 月 ${day} 日 · 周${WEEKDAYS[new Date(year, month - 1, day).getDay()]}`;
};
const timeTitle = (value: string) => {
  const date = new Date(value);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const fullDateTimeTitle = (value: string) => {
  const date = new Date(value);
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}  ${timeTitle(value)}`;
};
const periodTitle = (value: string) => new Date(value).getHours() < 12 ? '上午' : '下午';

function AppContent() {
  const today = useMemo(() => new Date(), []);
  const suppressSeasonMonthSync = useRef(false);
  const [draws, setDraws] = useState<Draw[]>(SAMPLE_DRAWS);
  const [ready, setReady] = useState(false);
  const [season, setSeason] = useState('S1');
  const [seasons, setSeasons] = useState<string[]>(DEFAULT_SEASONS);
  const [seasonManagerVisible, setSeasonManagerVisible] = useState(false);
  const [seasonDrawListVisible, setSeasonDrawListVisible] = useState(false);
  const [dataManagerVisible, setDataManagerVisible] = useState(false);
  const [dataTransferBusy, setDataTransferBusy] = useState(false);
  const [newSeasonName, setNewSeasonName] = useState('');
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => dateKey(today));
  const [modalVisible, setModalVisible] = useState(false);
  const [dayDetailVisible, setDayDetailVisible] = useState(false);
  const [inlineDayRecorderVisible, setInlineDayRecorderVisible] = useState(false);
  const [pendingDayAction, setPendingDayAction] = useState<PendingDayAction>(null);
  const [editingDrawId, setEditingDrawId] = useState<string | null>(null);
  const [general, setGeneral] = useState('');
  const [drawNumber, setDrawNumber] = useState('');
  const [isCoreGeneral, setIsCoreGeneral] = useState(false);
  const [isRecruitGeneral, setIsRecruitGeneral] = useState(false);
  const [generalPickerVisible, setGeneralPickerVisible] = useState(false);
  const [generalQuery, setGeneralQuery] = useState('');
  const [selectedFaction, setSelectedFaction] = useState('魏');
  const [drawAt, setDrawAt] = useState(() => new Date());
  const [screen, setScreen] = useState<'calendar' | 'library'>('calendar');
  const [libraryOverrides, setLibraryOverrides] = useState<LibraryOverrides>({});
  const [libraryItemId, setLibraryItemId] = useState<string | null>(null);
  const [libraryReturnTarget, setLibraryReturnTarget] = useState<'calendar' | 'seasonDrawList'>('calendar');

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(SEASONS_STORAGE_KEY),
      AsyncStorage.getItem(LIBRARY_OVERRIDES_KEY),
    ])
      .then(([drawValue, seasonValue, libraryValue]) => {
        const storedDraws = drawValue ? normalizeStoredDraws(drawValue) : SAMPLE_DRAWS;
        setDraws(storedDraws);

        if (libraryValue) {
          const parsed: unknown = JSON.parse(libraryValue);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            setLibraryOverrides(parsed as LibraryOverrides);
          }
        }

        if (seasonValue) {
          const parsed: unknown = JSON.parse(seasonValue);
          if (Array.isArray(parsed)) {
            const names = parsed.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
            if (names.length) {
              setSeasons(names);
              setSeason(names[0]);
              return;
            }
          }
        }
        const initialSeasons = [...new Set([...DEFAULT_SEASONS, ...storedDraws.map(item => item.season).filter(Boolean)])]
          .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
        setSeasons(initialSeasons);
        setSeason(initialSeasons[0]);
      })
      .catch(() => {
        setDraws(SAMPLE_DRAWS);
        setSeasons(DEFAULT_SEASONS);
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(draws)).catch(() => undefined);
  }, [draws, ready]);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(SEASONS_STORAGE_KEY, JSON.stringify(seasons)).catch(() => undefined);
  }, [ready, seasons]);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(LIBRARY_OVERRIDES_KEY, JSON.stringify(libraryOverrides)).catch(() => undefined);
  }, [libraryOverrides, ready]);

  const generalOptions = useMemo(() => GENERAL_OPTIONS.map(item => {
    const override = libraryOverrides[item.id];
    return override ? {
      ...item,
      name: override.name || item.name,
      faction: override.filters.faction?.[0] || item.faction,
    } : item;
  }), [libraryOverrides]);
  const generalOptionsByName = useMemo(() => new Map([
    ...GENERAL_OPTIONS.map(item => [item.name, item] as const),
    ...generalOptions.map(item => [item.name, item] as const),
  ]), [generalOptions]);

  const seasonDraws = useMemo(
    () => draws.filter(item => (item.season || 'S1') === season),
    [draws, season],
  );
  const chronologicalSeasonDraws = useMemo(
    () => [...seasonDraws].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [seasonDraws],
  );

  useEffect(() => {
    if (suppressSeasonMonthSync.current) {
      suppressSeasonMonthSync.current = false;
      return;
    }
    const latestDraw = draws
      .filter(item => (item.season || 'S1') === season)
      .reduce<Draw | null>((latest, item) => (
        !latest || new Date(item.createdAt) > new Date(latest.createdAt) ? item : latest
      ), null);
    if (!latestDraw) return;

    const latestDate = new Date(latestDraw.createdAt);
    setViewMonth(new Date(latestDate.getFullYear(), latestDate.getMonth(), 1));
    setSelectedDate(dateKey(latestDate));
  }, [season]);

  const seasonStats = useMemo(() => {
    if (!seasonDraws.length) return { total: 0, averageDays: null as number | null };

    const recordedDays = seasonDraws
      .map(item => dateKey(new Date(item.createdAt)))
      .sort();
    const toUtcDay = (value: string) => {
      const [year, month, day] = value.split('-').map(Number);
      return Date.UTC(year, month - 1, day);
    };
    const spanDays = Math.floor(
      (toUtcDay(recordedDays[recordedDays.length - 1]) - toUtcDay(recordedDays[0])) / 86_400_000,
    ) + 1;

    return {
      total: seasonDraws.length,
      averageDays: spanDays / seasonDraws.length,
    };
  }, [seasonDraws]);

  const drawsByDate = useMemo(() => {
    const grouped = new Map<string, Draw[]>();
    seasonDraws.forEach(item => {
      const key = dateKey(new Date(item.createdAt));
      grouped.set(key, [...(grouped.get(key) || []), item]);
    });
    grouped.forEach(items => items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    return grouped;
  }, [seasonDraws]);

  const calendarDays = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

    return Array.from({ length: cellCount }, (_, index) => {
      const day = index - firstWeekday + 1;
      if (day < 1 || day > daysInMonth) return null;
      const date = new Date(year, month, day);
      return { day, key: dateKey(date) };
    });
  }, [viewMonth]);

  const selectedDraws = drawsByDate.get(selectedDate) || [];
  const selectedDrawGroups = useMemo(() => ([
    { title: '上午', icon: 'sunny-outline' as const, items: selectedDraws.filter(item => periodTitle(item.createdAt) === '上午') },
    { title: '下午', icon: 'partly-sunny-outline' as const, items: selectedDraws.filter(item => periodTitle(item.createdAt) === '下午') },
  ]), [selectedDraws]);
  const monthCount = useMemo(() => {
    const prefix = `${viewMonth.getFullYear()}-${pad(viewMonth.getMonth() + 1)}`;
    return seasonDraws.filter(item => dateKey(new Date(item.createdAt)).startsWith(prefix)).length;
  }, [seasonDraws, viewMonth]);
  const factionOptions = useMemo(() => {
    const availableFactions = new Set(generalOptions.map(item => item.faction));
    return [
      ...GENERAL_FACTION_ORDER.filter(item => availableFactions.has(item)),
      ...Array.from(availableFactions).filter(item => !GENERAL_FACTION_ORDER.includes(item)),
    ];
  }, [generalOptions]);
  const filteredGenerals = useMemo(() => {
    const keyword = generalQuery.trim().toLocaleLowerCase('zh-CN');
    return generalOptions.filter(item => (
      item.faction === selectedFaction
      && (!keyword || item.name.toLocaleLowerCase('zh-CN').includes(keyword))
    ));
  }, [generalOptions, generalQuery, selectedFaction]);
  const manualGeneralName = generalQuery.trim();
  const canUseManualGeneral = Boolean(manualGeneralName) && !generalOptions.some(
    item => item.name.toLocaleLowerCase('zh-CN') === manualGeneralName.toLocaleLowerCase('zh-CN'),
  );

  const changeMonth = (offset: number) => {
    const next = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + offset, 1);
    const prefix = `${next.getFullYear()}-${pad(next.getMonth() + 1)}`;
    const seasonHasDrawsInMonth = (seasonName: string) => draws.some(item => (
      (item.season || 'S1') === seasonName
      && dateKey(new Date(item.createdAt)).startsWith(prefix)
    ));
    const nextSeason = seasonHasDrawsInMonth(season)
      ? season
      : seasons.find(seasonHasDrawsInMonth);

    if (nextSeason && nextSeason !== season) {
      suppressSeasonMonthSync.current = true;
      setSeason(nextSeason);
    }
    setViewMonth(next);
  };

  const prepareRecorderForDate = (targetDateKey: string) => {
    const [year, month, day] = targetDateKey.split('-').map(Number);
    const now = new Date();
    const targetDate = new Date(year, month - 1, day, now.getHours(), now.getMinutes());
    if (targetDateKey > dateKey(now)) {
      Alert.alert('不能记录未来日期', '请选择今天或过去的日期记录抽卡。');
      return false;
    }
    setSelectedDate(targetDateKey);
    setEditingDrawId(null);
    setDrawAt(targetDate);
    setGeneral('');
    setDrawNumber('');
    setIsCoreGeneral(false);
    setIsRecruitGeneral(false);
    setGeneralQuery('');
    setSelectedFaction('魏');
    return true;
  };

  const openRecorderForDate = (targetDateKey: string) => {
    if (!prepareRecorderForDate(targetDateKey)) return;
    setModalVisible(true);
  };

  const showDrawEditor = (item: Draw) => {
    setEditingDrawId(item.id);
    setGeneral(item.general);
    setDrawNumber(item.drawNumber ? String(item.drawNumber) : '');
    setIsCoreGeneral(Boolean(item.isCore));
    setIsRecruitGeneral(Boolean(item.isRecruit));
    setGeneralQuery('');
    setSelectedFaction('魏');
    setDrawAt(new Date(item.createdAt));
    setModalVisible(true);
  };

  const openDrawEditor = (item: Draw) => {
    setPendingDayAction({ type: 'edit', drawId: item.id });
    setDayDetailVisible(false);
  };

  const handleDayDetailDismiss = () => {
    setInlineDayRecorderVisible(false);
    setGeneralPickerVisible(false);
    if (!pendingDayAction) return;
    const action = pendingDayAction;
    setPendingDayAction(null);

    if (action.type === 'create') {
      openRecorderForDate(action.dateKey);
      return;
    }

    const item = draws.find(draw => draw.id === action.drawId);
    if (item) showDrawEditor(item);
  };

  const saveDraw = () => {
    const name = general.trim();
    if (!name) return;
    const parsedDrawNumber = drawNumber.trim() ? Math.max(1, Math.floor(Number(drawNumber))) : undefined;
    if (drawNumber.trim() && (!Number.isFinite(parsedDrawNumber) || parsedDrawNumber! < 1)) {
      Alert.alert('抽数格式不正确', '请输入大于 0 的整数。');
      return;
    }
    if (editingDrawId) {
      setDraws(current => current.map(item => item.id === editingDrawId
        ? { ...item, general: name, createdAt: drawAt.toISOString(), drawNumber: parsedDrawNumber, isCore: isCoreGeneral, isRecruit: isRecruitGeneral }
        : item));
      setViewMonth(new Date(drawAt.getFullYear(), drawAt.getMonth(), 1));
      setSelectedDate(dateKey(drawAt));
      setModalVisible(false);
      setEditingDrawId(null);
      return;
    }
    const item: Draw = {
      id: `${Date.now()}`,
      general: name,
      season,
      createdAt: drawAt.toISOString(),
      drawNumber: parsedDrawNumber,
      isCore: isCoreGeneral,
      isRecruit: isRecruitGeneral,
    };
    setDraws(current => [item, ...current]);
    setViewMonth(new Date(drawAt.getFullYear(), drawAt.getMonth(), 1));
    setSelectedDate(dateKey(drawAt));
    setModalVisible(false);
    setInlineDayRecorderVisible(false);
  };

  const deleteDraw = (item: Draw) => {
    Alert.alert(
      `删除“${item.general}”的记录？`,
      `${dateTitle(dateKey(new Date(item.createdAt)))} ${timeTitle(item.createdAt)}，删除后无法恢复。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认删除',
          style: 'destructive',
          onPress: () => {
            if ((drawsByDate.get(dateKey(new Date(item.createdAt))) || []).length <= 1) {
              setDayDetailVisible(false);
            }
            setDraws(current => current.filter(draw => draw.id !== item.id));
          },
        },
      ],
    );
  };

  const addSeason = () => {
    const name = newSeasonName.trim();
    if (!name) return;
    if (seasons.some(item => item.toLocaleLowerCase('zh-CN') === name.toLocaleLowerCase('zh-CN'))) {
      Alert.alert('赛季已存在', `“${name}”已经在赛季列表中。`);
      return;
    }
    const next = [name, ...seasons];
    setSeasons(next);
    setSeason(name);
    setNewSeasonName('');
  };

  const reorderSeason = (fromIndex: number, toIndex: number) => {
    setSeasons(current => {
      if (fromIndex < 0 || toIndex < 0 || toIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const deleteSeason = (name: string) => {
    if (seasons.length <= 1) {
      Alert.alert('无法删除', '至少需要保留一个赛季。');
      return;
    }
    const recordCount = draws.filter(item => item.season === name).length;
    Alert.alert(
      `删除赛季“${name}”？`,
      recordCount > 0
        ? `该赛季中的 ${recordCount} 条抽卡记录也会一起删除，此操作无法撤销。`
        : '删除后将不再显示这个赛季。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认删除',
          style: 'destructive',
          onPress: () => {
            const next = seasons.filter(item => item !== name);
            setSeasons(next);
            setDraws(current => current.filter(item => item.season !== name));
            if (season === name) setSeason(next[0]);
          },
        },
      ],
    );
  };

  const exportData = async () => {
    if (!FileSystem.cacheDirectory) {
      Alert.alert('导出失败', '当前设备无法创建临时备份文件。');
      return;
    }
    setDataTransferBusy(true);
    try {
      const now = new Date();
      const fileName = `三国抽卡簿备份-${dateKey(now)}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      const generalCategory = officialLibrary.categories.find(item => item.key === 'generals');
      const generalLibrary = generalCategory ? {
        source: officialLibrary.source,
        syncedAt: officialLibrary.syncedAt,
        category: {
          ...generalCategory,
          items: generalCategory.items.map(item => {
            const override = libraryOverrides[item.id];
            return override ? {
              ...item,
              name: override.name,
              filters: override.filters,
              details: override.details,
            } : item;
          }),
        },
      } : null;
      const payload = {
        app: '三国抽卡簿',
        version: 1,
        exportedAt: now.toISOString(),
        seasons,
        draws,
        generalLibrary,
        libraryOverrides,
      };
      const contents = JSON.stringify(payload, null, 2);
      await FileSystem.writeAsStringAsync(fileUri, contents, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (Platform.OS === 'ios') {
        await Share.open({
          url: fileUri,
          type: 'application/json',
          filename: fileName,
          saveToFiles: true,
          failOnCancel: false,
        });
        return;
      }

      if (Platform.OS === 'android') {
        const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted) return;
        const destinationUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permission.directoryUri,
          fileName,
          'application/json',
        );
        await FileSystem.writeAsStringAsync(destinationUri, contents, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        Alert.alert('导出完成', `备份已保存为“${fileName}”。`);
        return;
      }

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('导出失败', '当前设备不支持系统分享。');
        return;
      }
      await Sharing.shareAsync(fileUri, {
        UTI: 'public.json',
        mimeType: 'application/json',
        dialogTitle: '导出三国抽卡簿数据',
      });
    } catch (error) {
      Alert.alert('导出失败', error instanceof Error ? error.message : '无法生成备份文件。');
    } finally {
      setDataTransferBusy(false);
    }
  };

  const importData = async () => {
    setDataTransferBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/json', 'public.json'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;

      const contents = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const parsed: unknown = JSON.parse(contents);
      const rawDraws = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).draws)
          ? (parsed as Record<string, unknown>).draws as unknown[]
          : null;
      if (!rawDraws) throw new Error('这不是有效的三国抽卡簿备份文件。');

      const importedDraws = normalizeStoredDraws(JSON.stringify(rawDraws));
      if (rawDraws.length > 0 && importedDraws.length === 0) {
        throw new Error('备份中没有可识别的抽卡记录。');
      }
      const rawSeasons = !Array.isArray(parsed) && parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>).seasons
        : undefined;
      const rawLibraryOverrides = !Array.isArray(parsed) && parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>).libraryOverrides
        : undefined;
      const importedLibraryOverrides = rawLibraryOverrides && typeof rawLibraryOverrides === 'object' && !Array.isArray(rawLibraryOverrides)
        ? rawLibraryOverrides as LibraryOverrides
        : null;
      const importedSeasonNames = Array.isArray(rawSeasons)
        ? rawSeasons.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map(item => item.trim())
        : [];
      const importedSeasons = [...new Set([
        ...importedSeasonNames,
        ...importedDraws.map(item => item.season).filter(Boolean),
      ])].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
      if (!importedSeasons.length) importedSeasons.push('S1');

      Alert.alert(
        '确认导入数据？',
        `备份包含 ${importedSeasons.length} 个赛季、${importedDraws.length} 条记录。导入后将覆盖手机中的当前数据。`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '确认导入',
            style: 'destructive',
            onPress: () => {
              setDraws(importedDraws);
              setSeasons(importedSeasons);
              if (importedLibraryOverrides) setLibraryOverrides(importedLibraryOverrides);
              setSeason(importedSeasons[0]);
              const firstDate = importedDraws[0] ? new Date(importedDraws[0].createdAt) : new Date();
              setViewMonth(new Date(firstDate.getFullYear(), firstDate.getMonth(), 1));
              setSelectedDate(dateKey(firstDate));
              setDataManagerVisible(false);
              Alert.alert('导入完成', `已恢复 ${importedSeasons.length} 个赛季和 ${importedDraws.length} 条记录。`);
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert('导入失败', error instanceof Error ? error.message : '无法读取这个备份文件。');
    } finally {
      setDataTransferBusy(false);
    }
  };

  if (screen === 'library') {
    return (
      <LibraryScreen
        initialItemId={libraryItemId}
        onBack={() => {
          const shouldRestoreSeasonDrawList = libraryReturnTarget === 'seasonDrawList';
          setLibraryItemId(null);
          setLibraryReturnTarget('calendar');
          setScreen('calendar');
          if (shouldRestoreSeasonDrawList) setSeasonDrawListVisible(true);
        }}
        onLibraryUpdated={setLibraryOverrides}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.page}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>赛季记录</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasonRow}>
            {seasons.map(item => (
              <Pressable
                key={item}
                style={[styles.seasonChip, season === item && styles.seasonChipActive]}
                onPress={() => setSeason(item)}
              >
                <Text style={[styles.seasonText, season === item && styles.seasonTextActive]}>{item}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.manageSeasonButton} onPress={() => setSeasonManagerVisible(true)}>
              <SealIcon name="settings-outline" size={12} containerSize={25} />
              <Text style={styles.manageSeasonText}>管理</Text>
            </Pressable>
          </ScrollView>

          <View style={styles.calendarCard}>
            <View style={styles.monthHeader}>
              <Pressable style={styles.monthButton} onPress={() => changeMonth(-1)}>
                <Ionicons name="chevron-back" size={20} color="#44372D" />
              </Pressable>
              <View style={styles.monthCenter}>
                <Text style={styles.monthTitle}>{monthTitle(viewMonth)}</Text>
                <Text style={styles.monthMeta}>{monthCount} 条抽卡记录</Text>
              </View>
              <Pressable style={styles.monthButton} onPress={() => changeMonth(1)}>
                <Ionicons name="chevron-forward" size={20} color="#44372D" />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map(day => <Text key={day} style={styles.weekText}>{day}</Text>)}
            </View>
            <View style={styles.calendarGrid}>
              {calendarDays.map((item, index) => {
                if (!item) return <View key={`empty-${index}`} style={styles.dayCell} />;
                const dayDraws = drawsByDate.get(item.key) || [];
                const dayHasCoreGeneral = dayDraws.some(draw => draw.isCore);
                const isToday = item.key === dateKey(today);
                return (
                  <Pressable
                    key={item.key}
                    style={[
                      styles.dayCell,
                      dayDraws.length > 0 && styles.dayCellHasData,
                      dayHasCoreGeneral && styles.dayCellHasCore,
                    ]}
                    onPress={() => {
                      if (dayDraws.length > 0) {
                        setSelectedDate(item.key);
                        setDayDetailVisible(true);
                      } else {
                        openRecorderForDate(item.key);
                      }
                    }}
                  >
                    <View style={styles.dayTopRow}>
                      <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>{item.day}</Text>
                      {dayDraws.length > 2 && (
                        <Text style={styles.moreCount}>+{dayDraws.length - 2}</Text>
                      )}
                    </View>
                    <View style={styles.dayGeneralList}>
                      {dayDraws.slice(0, 2).map(draw => (
                        <Text
                          key={draw.id}
                          numberOfLines={2}
                          style={styles.dayGeneral}
                        >
                          {draw.general}{draw.drawNumber ? `·${draw.drawNumber}` : ''}
                        </Text>
                      ))}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.seasonStatsCard}>
            <View style={styles.seasonStatsHeader}>
              <CalendarActionIcon name="stats" size={20} containerSize={24} />
              <View>
                <Text style={styles.seasonStatsTitle}>{season} 赛季统计</Text>
              </View>
            </View>
            <View style={styles.seasonStatsMetrics}>
              <Pressable
                style={({ pressed }) => [styles.seasonStatItem, pressed && styles.seasonStatItemPressed]}
                onPress={() => setSeasonDrawListVisible(true)}
              >
                <Text style={styles.seasonStatValue}>{seasonStats.total}</Text>
                <Text style={styles.seasonStatLabel}>累计武将</Text>
              </Pressable>
              <View style={styles.seasonStatDivider} />
              <View style={styles.seasonStatItem}>
                <View style={styles.seasonAverageRow}>
                  <Text style={styles.seasonStatValue}>
                    {seasonStats.averageDays == null ? '—' : seasonStats.averageDays.toFixed(1)}
                  </Text>
                  {seasonStats.averageDays != null && <Text style={styles.seasonStatUnit}>天/名</Text>}
                </View>
                <Text style={styles.seasonStatLabel}>平均出将间隔</Text>
              </View>
            </View>
          </View>

          <View style={styles.pageActions}>
            <Pressable style={styles.pageActionButton} onPress={() => setDataManagerVisible(true)}>
              <CalendarActionIcon name="export" size={18} containerSize={20} />
              <Text style={styles.pageActionText}>数据导入导出</Text>
            </Pressable>
            <Pressable style={styles.pageActionButton} onPress={() => {
              setLibraryItemId(null);
              setLibraryReturnTarget('calendar');
              setScreen('library');
            }}>
              <CalendarActionIcon name="library" size={18} containerSize={20} />
              <Text style={styles.pageActionText}>资料库</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => generalPickerVisible ? setGeneralPickerVisible(false) : setModalVisible(false)}
      >
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.dismissArea} onPress={() => setModalVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>{editingDrawId ? '编辑记录' : '记录抽卡'}</Text>
                <Text style={styles.sheetSeason}>{editingDrawId ? `正在修改 ${season} 赛季记录` : `将归入 ${season} 赛季`}</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={20} color="#766A60" />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>抽到的武将</Text>
            <Pressable
              style={[styles.generalSelect, general && styles.generalSelectChosen]}
              onPress={() => setGeneralPickerVisible(true)}
            >
              {general ? (
                <View style={styles.chosenGeneralIcon}>
                  <Text style={styles.chosenGeneralIconText}>{general.slice(0, 1)}</Text>
                </View>
              ) : (
                <SealIcon name="people-outline" size={16} containerSize={34} color="#A0958A" />
              )}
              <View style={styles.generalSelectCopy}>
                <Text style={general ? styles.generalSelectValue : styles.generalSelectPlaceholder}>
                  {general || '选择或输入武将名称'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={19} color="#A74433" />
            </Pressable>

            <Pressable
              style={[styles.coreGeneralToggle, isCoreGeneral && styles.coreGeneralToggleActive]}
              onPress={() => setIsCoreGeneral(current => !current)}
            >
              <SealIcon
                name="diamond-outline"
                size={15}
                containerSize={36}
                color={isCoreGeneral ? '#FFF8E6' : '#9A8872'}
                backgroundColor={isCoreGeneral ? '#B58A2C' : '#ECE3D7'}
                borderColor={isCoreGeneral ? '#E0C16D' : '#C8B79F'}
              />
              <View style={styles.coreGeneralCopy}>
                <Text style={styles.coreGeneralTitle}>核心武将</Text>
              </View>
              <View style={[styles.coreGeneralStatus, isCoreGeneral && styles.coreGeneralStatusActive]}>
                <Text style={[styles.coreGeneralStatusText, isCoreGeneral && styles.coreGeneralStatusTextActive]}>
                  {isCoreGeneral ? '已标记' : '普通'}
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.coreGeneralToggle, isRecruitGeneral && styles.recruitGeneralToggleActive]}
              onPress={() => setIsRecruitGeneral(current => !current)}
            >
              <SealIcon
                name="leaf-outline"
                size={15}
                containerSize={36}
                color={isRecruitGeneral ? '#F4FFF3' : '#7F927E'}
                backgroundColor={isRecruitGeneral ? '#4F8A52' : '#E4ECE2'}
                borderColor={isRecruitGeneral ? '#86B989' : '#B8C9B7'}
              />
              <View style={styles.coreGeneralCopy}>
                <Text style={styles.coreGeneralTitle}>寻访武将</Text>
              </View>
              <View style={[styles.coreGeneralStatus, isRecruitGeneral && styles.recruitGeneralStatusActive]}>
                <Text style={[styles.coreGeneralStatusText, isRecruitGeneral && styles.coreGeneralStatusTextActive]}>
                  {isRecruitGeneral ? '已标记' : '普通'}
                </Text>
              </View>
            </Pressable>

            <Text style={styles.inputLabel}>第几抽（可选）</Text>
            <View style={styles.drawNumberInputWrap}>
              <Text style={styles.drawNumberPrefix}>第</Text>
              <TextInput
                style={styles.drawNumberInput}
                value={drawNumber}
                onChangeText={value => setDrawNumber(value.replace(/[^0-9]/g, ''))}
                placeholder="例如 32"
                placeholderTextColor="#AAA198"
                keyboardType="number-pad"
                inputAccessoryViewID={Platform.OS === 'ios' ? DRAW_NUMBER_ACCESSORY_ID : undefined}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                maxLength={6}
              />
              <Text style={styles.drawNumberSuffix}>抽</Text>
            </View>

            <Text style={styles.inputLabel}>抽到的时间</Text>
            <View style={styles.pickerWrap}>
              <DateTimePicker
                value={drawAt}
                mode="datetime"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                locale="zh-CN"
                maximumDate={new Date()}
                onChange={(_, value) => value && setDrawAt(value)}
                style={styles.picker}
              />
            </View>

            <Pressable style={[styles.submit, !general.trim() && styles.submitDisabled]} onPress={saveDraw}>
              <Text style={styles.submitText}>{editingDrawId ? '保存修改' : `保存到 ${season}`}</Text>
            </Pressable>
          </View>

          {generalPickerVisible && (
            <View style={styles.inlineGeneralOverlay}>
              <Pressable style={styles.inlineGeneralBackdrop} onPress={() => setGeneralPickerVisible(false)} />
              <View style={styles.inlineGeneralSheet}>
                <View style={styles.handle} />
                <View style={styles.generalPickerHeader}>
                  <Pressable style={styles.generalPickerClose} onPress={() => setGeneralPickerVisible(false)}>
                    <Ionicons name="chevron-down" size={22} color="#3D322A" />
                  </Pressable>
                  <View style={styles.generalPickerTitleWrap}>
                    <Text style={styles.generalPickerTitle}>选择武将</Text>
                  </View>
                  <View style={styles.generalPickerClose} />
                </View>

                <View style={styles.generalSearch}>
                  <Ionicons name="search" size={19} color="#9C9085" />
                  <TextInput
                    style={styles.generalSearchInput}
                    value={generalQuery}
                    onChangeText={setGeneralQuery}
                    placeholder="搜索或输入武将名称"
                    placeholderTextColor="#A69B91"
                    clearButtonMode="while-editing"
                    maxLength={20}
                    returnKeyType={canUseManualGeneral ? 'done' : 'search'}
                    onSubmitEditing={() => {
                      if (!canUseManualGeneral) return;
                      setGeneral(manualGeneralName);
                      setGeneralPickerVisible(false);
                    }}
                  />
                </View>

                <ScrollView
                  horizontal
                  style={styles.factionFilterScroll}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.factionFilterRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {factionOptions.map(item => (
                    <Pressable
                      key={item}
                      style={[styles.factionChip, selectedFaction === item && styles.factionChipActive]}
                      onPress={() => setSelectedFaction(item)}
                    >
                      <Text style={[styles.factionChipText, selectedFaction === item && styles.factionChipTextActive]}>{item}</Text>
                    </Pressable>
                  ))}
                </ScrollView>

                {canUseManualGeneral && (
                  <Pressable
                    style={styles.manualGeneralOption}
                    onPress={() => {
                      setGeneral(manualGeneralName);
                      setGeneralPickerVisible(false);
                    }}
                  >
                    <SealIcon name="create-outline" size={17} containerSize={42} color="#FFF9EE" backgroundColor="#A74433" />
                    <View style={styles.generalOptionCopy}>
                      <Text style={styles.manualGeneralTitle}>使用“{manualGeneralName}”</Text>
                    </View>
                    <Ionicons name="add-circle" size={23} color="#A74433" />
                  </Pressable>
                )}

                <FlatList
                  data={filteredGenerals}
                  keyExtractor={item => item.id}
                  numColumns={6}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.generalList}
                  columnWrapperStyle={styles.generalGridRow}
                  renderItem={({ item }) => {
                    const selected = general === item.name;
                    const image = officialLibraryAssets[item.imageAssetKey];
                    return (
                      <Pressable
                        style={[styles.generalCard, selected && styles.generalCardSelected]}
                        onPress={() => {
                          setGeneral(item.name);
                          setGeneralPickerVisible(false);
                        }}
                      >
                        {image ? (
                          <Image source={image} style={styles.generalCardImage} resizeMode="cover" />
                        ) : (
                          <View style={styles.generalCardFallback}><Text style={styles.generalCardFallbackText}>{item.name.slice(0, 1)}</Text></View>
                        )}
                        <Text numberOfLines={1} style={styles.generalCardName}>{item.name}</Text>
                        {selected && (
                          <View style={styles.generalCardCheck}>
                            <Ionicons name="checkmark" size={10} color="#FFF9EE" />
                          </View>
                        )}
                      </Pressable>
                    );
                  }}
                  ListEmptyComponent={(
                    <View style={styles.generalEmpty}>
                      <Ionicons name="search-outline" size={30} color="#AA9E93" />
                      <Text style={styles.generalEmptyTitle}>没有找到这个武将</Text>
                    </View>
                  )}
                />
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={false}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setGeneralPickerVisible(false)}
      >
        <SafeAreaView style={styles.pickerSafe}>
          <StatusBar style="dark" />
          <View style={styles.generalPickerHeader}>
            <Pressable style={styles.generalPickerClose} onPress={() => setGeneralPickerVisible(false)}>
              <Ionicons name="chevron-back" size={22} color="#3D322A" />
            </Pressable>
            <View style={styles.generalPickerTitleWrap}>
              <Text style={styles.generalPickerTitle}>选择武将</Text>
            </View>
            <View style={styles.generalPickerClose} />
          </View>

          <View style={styles.generalSearch}>
            <Ionicons name="search" size={19} color="#9C9085" />
            <TextInput
              style={styles.generalSearchInput}
              value={generalQuery}
              onChangeText={setGeneralQuery}
              placeholder="搜索或输入武将名称"
              placeholderTextColor="#A69B91"
              clearButtonMode="while-editing"
              maxLength={20}
              returnKeyType={canUseManualGeneral ? 'done' : 'search'}
              onSubmitEditing={() => {
                if (!canUseManualGeneral) return;
                setGeneral(manualGeneralName);
                setGeneralPickerVisible(false);
              }}
            />
          </View>

          {canUseManualGeneral && (
            <Pressable
              style={styles.manualGeneralOption}
              onPress={() => {
                setGeneral(manualGeneralName);
                setGeneralPickerVisible(false);
              }}
            >
              <SealIcon name="create-outline" size={17} containerSize={42} color="#FFF9EE" backgroundColor="#A74433" />
              <View style={styles.generalOptionCopy}>
                <Text style={styles.manualGeneralTitle}>使用“{manualGeneralName}”</Text>
              </View>
              <Ionicons name="add-circle" size={23} color="#A74433" />
            </Pressable>
          )}

          <FlatList
            data={filteredGenerals}
            keyExtractor={item => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.generalList}
            renderItem={({ item }) => {
              const selected = general === item.name;
              const image = officialLibraryAssets[item.imageAssetKey];
              return (
                <Pressable
                  style={[styles.generalOption, selected && styles.generalOptionSelected]}
                  onPress={() => {
                    setGeneral(item.name);
                    setGeneralPickerVisible(false);
                  }}
                >
                  {image ? (
                    <Image source={image} style={styles.generalOptionImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.generalOptionFallback}><Text style={styles.generalOptionFallbackText}>{item.name.slice(0, 1)}</Text></View>
                  )}
                  <View style={styles.generalOptionCopy}>
                    <Text style={styles.generalOptionName}>{item.name}</Text>
                    <Text style={styles.generalOptionFaction}>{item.faction} · 武将库</Text>
                  </View>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={23} color="#A74433" />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color="#B4A89D" />
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={(
              <View style={styles.generalEmpty}>
                <Ionicons name="search-outline" size={30} color="#AA9E93" />
                <Text style={styles.generalEmptyTitle}>没有找到这个武将</Text>
              </View>
            )}
          />
        </SafeAreaView>
      </Modal>

      <Modal visible={seasonManagerVisible} transparent animationType="slide" onRequestClose={() => setSeasonManagerVisible(false)}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.dismissArea} onPress={() => setSeasonManagerVisible(false)} />
          <View style={styles.seasonSheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>管理赛季</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={() => setSeasonManagerVisible(false)}>
                <Ionicons name="close" size={20} color="#766A60" />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>新增赛季</Text>
            <View style={styles.addSeasonRow}>
              <TextInput
                style={styles.seasonNameInput}
                value={newSeasonName}
                onChangeText={setNewSeasonName}
                placeholder="例如 S4、PK1"
                placeholderTextColor="#AAA198"
                returnKeyType="done"
                onSubmitEditing={addSeason}
              />
              <Pressable style={[styles.addSeasonButton, !newSeasonName.trim() && styles.submitDisabled]} onPress={addSeason}>
                <Ionicons name="add" size={21} color="#FFF9EE" />
                <Text style={styles.addSeasonButtonText}>添加</Text>
              </Pressable>
            </View>

            <View style={styles.seasonListLabelRow}>
              <Text style={styles.inputLabel}>已有赛季</Text>
              <Text style={styles.seasonDragHint}>按住右侧拖拽排序</Text>
            </View>
            <ScrollView style={styles.seasonManageList} showsVerticalScrollIndicator={false}>
              {seasons.map((item, index) => {
                const recordCount = draws.filter(draw => draw.season === item).length;
                return (
                  <SeasonManageRow
                    key={item}
                    item={item}
                    index={index}
                    total={seasons.length}
                    selected={season === item}
                    recordCount={recordCount}
                    onSelect={() => setSeason(item)}
                    onDelete={() => deleteSeason(item)}
                    onReorder={reorderSeason}
                  />
                );
              })}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={dayDetailVisible}
        transparent
        animationType="slide"
        onDismiss={handleDayDetailDismiss}
        onRequestClose={() => {
          if (generalPickerVisible) setGeneralPickerVisible(false);
          else if (inlineDayRecorderVisible) setInlineDayRecorderVisible(false);
          else setDayDetailVisible(false);
        }}
      >
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.dismissArea} onPress={() => setDayDetailVisible(false)} />
          <View style={styles.dayDetailSheet}>
            {inlineDayRecorderVisible ? (
              <>
                <View style={styles.handle} />
                <View style={styles.sheetHeader}>
                  <View>
                    <Text style={styles.sheetTitle}>新增抽卡记录</Text>
                    <Text style={styles.sheetSeason}>{dateTitle(selectedDate)} · {season}</Text>
                  </View>
                  <Pressable style={styles.closeButton} onPress={() => setInlineDayRecorderVisible(false)}>
                    <Ionicons name="chevron-back" size={20} color="#766A60" />
                  </Pressable>
                </View>

                <Text style={styles.inputLabel}>抽到的武将</Text>
                <Pressable
                  style={[styles.generalSelect, general && styles.generalSelectChosen]}
                  onPress={() => setGeneralPickerVisible(true)}
                >
                  {general ? (
                    <View style={styles.chosenGeneralIcon}>
                      <Text style={styles.chosenGeneralIconText}>{general.slice(0, 1)}</Text>
                    </View>
                  ) : (
                    <SealIcon name="people-outline" size={16} containerSize={34} color="#A0958A" />
                  )}
                  <View style={styles.generalSelectCopy}>
                    <Text style={general ? styles.generalSelectValue : styles.generalSelectPlaceholder}>
                      {general || '选择或输入武将名称'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={19} color="#A74433" />
                </Pressable>

                <Pressable
                  style={[styles.coreGeneralToggle, isCoreGeneral && styles.coreGeneralToggleActive]}
                  onPress={() => setIsCoreGeneral(current => !current)}
                >
                  <SealIcon
                    name="diamond-outline"
                    size={15}
                    containerSize={36}
                    color={isCoreGeneral ? '#FFF8E6' : '#9A8872'}
                    backgroundColor={isCoreGeneral ? '#B58A2C' : '#ECE3D7'}
                    borderColor={isCoreGeneral ? '#E0C16D' : '#C8B79F'}
                  />
                  <View style={styles.coreGeneralCopy}>
                    <Text style={styles.coreGeneralTitle}>核心武将</Text>
                  </View>
                  <View style={[styles.coreGeneralStatus, isCoreGeneral && styles.coreGeneralStatusActive]}>
                    <Text style={[styles.coreGeneralStatusText, isCoreGeneral && styles.coreGeneralStatusTextActive]}>
                      {isCoreGeneral ? '已标记' : '普通'}
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  style={[styles.coreGeneralToggle, isRecruitGeneral && styles.recruitGeneralToggleActive]}
                  onPress={() => setIsRecruitGeneral(current => !current)}
                >
                  <SealIcon
                    name="leaf-outline"
                    size={15}
                    containerSize={36}
                    color={isRecruitGeneral ? '#F4FFF3' : '#7F927E'}
                    backgroundColor={isRecruitGeneral ? '#4F8A52' : '#E4ECE2'}
                    borderColor={isRecruitGeneral ? '#86B989' : '#B8C9B7'}
                  />
                  <View style={styles.coreGeneralCopy}>
                    <Text style={styles.coreGeneralTitle}>寻访武将</Text>
                  </View>
                  <View style={[styles.coreGeneralStatus, isRecruitGeneral && styles.recruitGeneralStatusActive]}>
                    <Text style={[styles.coreGeneralStatusText, isRecruitGeneral && styles.coreGeneralStatusTextActive]}>
                      {isRecruitGeneral ? '已标记' : '普通'}
                    </Text>
                  </View>
                </Pressable>

                <Text style={styles.inputLabel}>第几抽（可选）</Text>
                <View style={styles.drawNumberInputWrap}>
                  <Text style={styles.drawNumberPrefix}>第</Text>
                  <TextInput
                    style={styles.drawNumberInput}
                    value={drawNumber}
                    onChangeText={value => setDrawNumber(value.replace(/[^0-9]/g, ''))}
                    placeholder="例如 32"
                    placeholderTextColor="#AAA198"
                    keyboardType="number-pad"
                    inputAccessoryViewID={Platform.OS === 'ios' ? DRAW_NUMBER_ACCESSORY_ID : undefined}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    maxLength={6}
                  />
                  <Text style={styles.drawNumberSuffix}>抽</Text>
                </View>

                <Text style={styles.inputLabel}>抽到的时间</Text>
                <View style={styles.pickerWrap}>
                  <DateTimePicker
                    value={drawAt}
                    mode="datetime"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    locale="zh-CN"
                    maximumDate={new Date()}
                    onChange={(_, value) => value && setDrawAt(value)}
                    style={styles.picker}
                  />
                </View>

                <Pressable style={[styles.submit, !general.trim() && styles.submitDisabled]} onPress={saveDraw}>
                  <Text style={styles.submitText}>保存到 {season}</Text>
                </Pressable>
              </>
            ) : (
              <>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>{dateTitle(selectedDate)}</Text>
                <Text style={styles.sheetSeason}>{season} · {selectedDraws.length} 条抽卡记录</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={() => setDayDetailVisible(false)}>
                <Ionicons name="close" size={20} color="#766A60" />
              </Pressable>
            </View>

            <ScrollView style={styles.dayDetailScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.recordList}>
                {selectedDrawGroups.filter(group => group.items.length > 0).map((group, groupIndex) => (
                  <View key={group.title} style={groupIndex > 0 ? styles.periodSectionDivider : undefined}>
                    <View style={styles.periodHeader}>
                      <Ionicons name={group.icon} size={16} color="#A74433" />
                      <Text style={styles.periodTitle}>{group.title}</Text>
                      <Text style={styles.periodCount}>{group.items.length} 位武将</Text>
                    </View>
                    {group.items.map((item, index) => {
                      const option = generalOptionsByName.get(item.general);
                      const image = option ? officialLibraryAssets[option.imageAssetKey] : undefined;
                      return (
                        <View key={item.id} style={[styles.recordRow, index > 0 && styles.recordDivider]}>
                          <View style={styles.timeBadge}><Text style={styles.timeText}>{timeTitle(item.createdAt)}</Text></View>
                          {image ? (
                            <Image source={image} style={styles.recordAvatarImage} resizeMode="cover" />
                          ) : (
                            <View style={styles.avatar}><Text style={styles.avatarText}>{item.general.slice(0, 1)}</Text></View>
                          )}
                          <View style={styles.recordNameWrap}>
                            <View style={styles.generalNameRow}>
                              {option ? (
                                <Pressable
                                  hitSlop={8}
                                  onPress={() => {
                                    setDayDetailVisible(false);
                                    setLibraryItemId(option.id);
                                    setLibraryReturnTarget('calendar');
                                    setScreen('library');
                                  }}
                                >
                                  <Text style={[styles.generalName, styles.generalNameLink]}>{item.general}</Text>
                                </Pressable>
                              ) : (
                                <Text style={styles.generalName}>{item.general}</Text>
                              )}
                              {item.isCore && <Text style={styles.coreGeneralBadge}>核心</Text>}
                              {item.isRecruit && <Text style={styles.recruitGeneralBadge}>寻访</Text>}
                              {item.drawNumber && <Text style={styles.drawNumberBadge}>第 {item.drawNumber} 抽</Text>}
                            </View>
                            <Text style={styles.periodHint}>{group.title}抽到</Text>
                          </View>
                          <Pressable style={styles.recordActionButton} onPress={() => openDrawEditor(item)}>
                            <Ionicons name="pencil-outline" size={17} color="#77695E" />
                          </Pressable>
                          <Pressable style={[styles.recordActionButton, styles.recordDeleteButton]} onPress={() => deleteDraw(item)}>
                            <Ionicons name="trash-outline" size={17} color="#B64D3C" />
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
            <Pressable
              style={styles.dayAddButton}
              onPress={() => {
                if (prepareRecorderForDate(selectedDate)) setInlineDayRecorderVisible(true);
              }}
            >
              <Ionicons name="add-circle-outline" size={19} color="#FFF9EE" />
              <Text style={styles.dayAddButtonText}>新增当天抽卡记录</Text>
            </Pressable>
              </>
            )}

            {inlineDayRecorderVisible && generalPickerVisible && (
              <View style={styles.inlineGeneralOverlay}>
                <Pressable style={styles.inlineGeneralBackdrop} onPress={() => setGeneralPickerVisible(false)} />
                <View style={[styles.inlineGeneralSheet, styles.dayInlineGeneralSheet]}>
                  <View style={styles.handle} />
                  <View style={styles.generalPickerHeader}>
                    <Pressable style={styles.generalPickerClose} onPress={() => setGeneralPickerVisible(false)}>
                      <Ionicons name="chevron-down" size={22} color="#3D322A" />
                    </Pressable>
                    <View style={styles.generalPickerTitleWrap}>
                      <Text style={styles.generalPickerTitle}>选择武将</Text>
                    </View>
                    <View style={styles.generalPickerClose} />
                  </View>

                  <View style={styles.generalSearch}>
                    <Ionicons name="search" size={19} color="#9C9085" />
                    <TextInput
                      style={styles.generalSearchInput}
                      value={generalQuery}
                      onChangeText={setGeneralQuery}
                      placeholder="搜索或输入武将名称"
                      placeholderTextColor="#A69B91"
                      clearButtonMode="while-editing"
                      maxLength={20}
                      returnKeyType={canUseManualGeneral ? 'done' : 'search'}
                      onSubmitEditing={() => {
                        if (!canUseManualGeneral) return;
                        setGeneral(manualGeneralName);
                        setGeneralPickerVisible(false);
                      }}
                    />
                  </View>

                  <ScrollView
                    horizontal
                    style={styles.factionFilterScroll}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.factionFilterRow}
                    keyboardShouldPersistTaps="handled"
                  >
                    {factionOptions.map(item => (
                      <Pressable
                        key={item}
                        style={[styles.factionChip, selectedFaction === item && styles.factionChipActive]}
                        onPress={() => setSelectedFaction(item)}
                      >
                        <Text style={[styles.factionChipText, selectedFaction === item && styles.factionChipTextActive]}>{item}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  {canUseManualGeneral && (
                    <Pressable
                      style={styles.manualGeneralOption}
                      onPress={() => {
                        setGeneral(manualGeneralName);
                        setGeneralPickerVisible(false);
                      }}
                    >
                      <SealIcon name="create-outline" size={17} containerSize={42} color="#FFF9EE" backgroundColor="#A74433" />
                      <View style={styles.generalOptionCopy}>
                        <Text style={styles.manualGeneralTitle}>使用“{manualGeneralName}”</Text>
                      </View>
                      <Ionicons name="add-circle" size={23} color="#A74433" />
                    </Pressable>
                  )}

                  <FlatList
                    data={filteredGenerals}
                    keyExtractor={item => item.id}
                    numColumns={6}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.generalList}
                    columnWrapperStyle={styles.generalGridRow}
                    renderItem={({ item }) => {
                      const selected = general === item.name;
                      const image = officialLibraryAssets[item.imageAssetKey];
                      return (
                        <Pressable
                          style={[styles.generalCard, selected && styles.generalCardSelected]}
                          onPress={() => {
                            setGeneral(item.name);
                            setGeneralPickerVisible(false);
                          }}
                        >
                          {image ? (
                            <Image source={image} style={styles.generalCardImage} resizeMode="cover" />
                          ) : (
                            <View style={styles.generalCardFallback}><Text style={styles.generalCardFallbackText}>{item.name.slice(0, 1)}</Text></View>
                          )}
                          <Text numberOfLines={1} style={styles.generalCardName}>{item.name}</Text>
                          {selected && (
                            <View style={styles.generalCardCheck}>
                              <Ionicons name="checkmark" size={10} color="#FFF9EE" />
                            </View>
                          )}
                        </Pressable>
                      );
                    }}
                    ListEmptyComponent={(
                      <View style={styles.generalEmpty}>
                        <Ionicons name="search-outline" size={30} color="#AA9E93" />
                        <Text style={styles.generalEmptyTitle}>没有找到这个武将</Text>
                      </View>
                    )}
                  />
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={seasonDrawListVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSeasonDrawListVisible(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.dismissArea} onPress={() => setSeasonDrawListVisible(false)} />
          <View style={styles.seasonDrawListSheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>累计武将</Text>
                <Text style={styles.sheetSeason}>{season} · {chronologicalSeasonDraws.length} 位 · 按时间正序</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={() => setSeasonDrawListVisible(false)}>
                <Ionicons name="close" size={20} color="#766A60" />
              </Pressable>
            </View>

            <ScrollView style={styles.seasonDrawListScroll} showsVerticalScrollIndicator={false}>
              {chronologicalSeasonDraws.length === 0 ? (
                <View style={styles.seasonDrawListEmpty}>
                  <Ionicons name="file-tray-outline" size={30} color="#AA9E93" />
                  <Text style={styles.generalEmptyTitle}>本赛季还没有抽卡记录</Text>
                </View>
              ) : chronologicalSeasonDraws.map((item, index) => {
                const option = generalOptionsByName.get(item.general);
                const image = option ? officialLibraryAssets[option.imageAssetKey] : undefined;
                return (
                  <Pressable
                    key={item.id}
                    disabled={!option}
                    style={({ pressed }) => [
                      styles.seasonDrawListRow,
                      index > 0 && styles.recordDivider,
                      pressed && styles.seasonDrawListRowPressed,
                    ]}
                    onPress={() => {
                      if (!option) return;
                      setSeasonDrawListVisible(false);
                      setLibraryItemId(option.id);
                      setLibraryReturnTarget('seasonDrawList');
                      setScreen('library');
                    }}
                  >
                    <View style={styles.seasonDrawOrderBadge}>
                      <Text style={styles.seasonDrawOrderText}>{index + 1}</Text>
                    </View>
                    {image ? (
                      <Image source={image} style={styles.seasonDrawAvatar} resizeMode="cover" />
                    ) : (
                      <View style={[styles.seasonDrawAvatar, styles.seasonDrawAvatarFallback]}>
                        <Text style={styles.seasonDrawAvatarText}>{item.general.slice(0, 1)}</Text>
                      </View>
                    )}
                    <View style={styles.seasonDrawListCopy}>
                      <View style={styles.generalNameRow}>
                        <Text style={[styles.seasonDrawListName, option && styles.seasonDrawListNameLink]}>{item.general}</Text>
                        {item.isCore && <Text style={styles.coreGeneralBadge}>核心</Text>}
                        {item.isRecruit && <Text style={styles.recruitGeneralBadge}>寻访</Text>}
                        {item.drawNumber && <Text style={styles.drawNumberBadge}>第 {item.drawNumber} 抽</Text>}
                      </View>
                      <Text style={styles.seasonDrawListTime}>{fullDateTimeTitle(item.createdAt)}</Text>
                    </View>
                    {option && <Ionicons name="chevron-forward" size={18} color="#B4A89D" />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={dataManagerVisible} transparent animationType="slide" onRequestClose={() => setDataManagerVisible(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.dismissArea} onPress={() => !dataTransferBusy && setDataManagerVisible(false)} />
          <View style={styles.dataSheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>数据备份</Text>
                <Text style={styles.sheetSeason}>{seasons.length} 个赛季 · {draws.length} 条抽卡记录</Text>
              </View>
              <Pressable style={styles.closeButton} disabled={dataTransferBusy} onPress={() => setDataManagerVisible(false)}>
                <Ionicons name="close" size={20} color="#766A60" />
              </Pressable>
            </View>

            <Pressable style={styles.dataActionCard} disabled={dataTransferBusy} onPress={exportData}>
              <SealIcon name="share-outline" size={19} containerSize={46} />
              <View style={styles.dataActionCopy}>
                <Text style={styles.dataActionTitle}>导出备份</Text>
              </View>
              <Ionicons name="chevron-forward" size={19} color="#AA9E93" />
            </Pressable>

            <Pressable style={styles.dataActionCard} disabled={dataTransferBusy} onPress={importData}>
              <SealIcon name="folder-open-outline" size={19} containerSize={46} />
              <View style={styles.dataActionCopy}>
                <Text style={styles.dataActionTitle}>导入备份</Text>
              </View>
              <Ionicons name="chevron-forward" size={19} color="#AA9E93" />
            </Pressable>

            {dataTransferBusy && (
              <Text style={styles.dataBusyText}>正在处理数据，请稍候…</Text>
            )}
          </View>
        </View>
      </Modal>
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={DRAW_NUMBER_ACCESSORY_ID}>
          <View style={styles.keyboardToolbar}>
            <Pressable style={styles.keyboardDoneButton} onPress={Keyboard.dismiss}>
              <Text style={styles.keyboardDoneText}>完成</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <AppErrorBoundary>
        <AppContent />
      </AppErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: { flex: 1, backgroundColor: '#F5F1E8' },
  sealIconFrame: { alignItems: 'center', justifyContent: 'center' },
  fallbackSafe: { flex: 1, backgroundColor: '#F5F1E8', justifyContent: 'center', paddingHorizontal: 24 },
  fallbackCard: { backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#E8DFD3', borderRadius: 22, padding: 24, alignItems: 'center' },
  fallbackTitle: { color: '#312821', fontSize: 20, fontWeight: '800', marginTop: 12 },
  fallbackText: { color: '#8C7E72', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 8 },
  fallbackButton: { height: 44, minWidth: 120, borderRadius: 14, backgroundColor: '#A74433', alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  fallbackButtonText: { color: '#FFF9EE', fontSize: 14, fontWeight: '800' },
  safe: { flex: 1, backgroundColor: '#F5F1E8' },
  page: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 30 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  title: { color: '#2D251F', fontSize: 28, fontWeight: '800', marginTop: 4 },
  pageActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  pageActionButton: { flex: 1, height: 48, borderRadius: 15, backgroundColor: '#EAE1D3', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  pageActionText: { color: '#A74433', fontSize: 13, fontWeight: '400' },
  manageSeasonButton: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#EAE1D3', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  manageSeasonText: { color: '#A74433', fontSize: 12, fontWeight: '800' },
  seasonRow: { gap: 9, paddingRight: 18, marginBottom: 16 },
  seasonChip: { minWidth: 62, height: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#EAE3D8', alignItems: 'center', justifyContent: 'center' },
  seasonChipActive: { backgroundColor: '#A74433' },
  seasonText: { color: '#73675D', fontSize: 13, fontWeight: '700' },
  seasonTextActive: { color: '#FFF9EE' },
  calendarCard: { backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#E8DFD3', borderRadius: 22, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 12, shadowColor: '#6E5948', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 3, marginBottom: 16 },
  monthButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F1ECE3', alignItems: 'center', justifyContent: 'center' },
  monthCenter: { alignItems: 'center' },
  monthTitle: { color: '#342B24', fontSize: 17, fontWeight: '800' },
  monthMeta: { color: '#A0958B', fontSize: 10, marginTop: 3 },
  weekRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#EFE8DE', paddingBottom: 9 },
  weekText: { width: '14.2857%', textAlign: 'center', color: '#A1958A', fontSize: 11, fontWeight: '600' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: 7 },
  dayCell: { width: '14.2857%', height: 88, paddingHorizontal: 2, paddingTop: 5, borderRadius: 10 },
  dayCellHasData: { backgroundColor: '#F5EDE5' },
  dayCellHasCore: { backgroundColor: '#F1DFAD', borderWidth: 1, borderColor: '#D8BA69' },
  dayCellSelected: { backgroundColor: '#A74433' },
  dayTopRow: { height: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayNumber: { color: '#53483F', fontSize: 13, fontWeight: '600' },
  dayNumberToday: { width: 22, height: 22, lineHeight: 22, borderRadius: 11, backgroundColor: '#A74433', color: '#FFF9EE', fontWeight: '900', textAlign: 'center', overflow: 'hidden' },
  dayNumberSelected: { color: '#FFF9EE', fontWeight: '800' },
  moreCount: { color: '#A74433', fontSize: 8, fontWeight: '800' },
  moreCountSelected: { color: '#F7D9C4' },
  dayGeneralList: { gap: 1, alignItems: 'stretch' },
  dayGeneral: { width: '100%', color: '#8B612A', fontSize: 10, fontWeight: '800', lineHeight: 15, textAlign: 'left', flexShrink: 1 },
  dayGeneralSelected: { color: '#FFF5DF' },
  seasonStatsCard: { marginTop: 14, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#E8DFD3', borderRadius: 20, padding: 16 },
  seasonStatsHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  seasonStatsIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F4E7E2', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  seasonStatsTitle: { color: '#3A3028', fontSize: 15, fontWeight: '800' },
  seasonStatsMetrics: { minHeight: 82, marginTop: 13, borderRadius: 15, backgroundColor: '#F6F0E7', flexDirection: 'row', alignItems: 'center' },
  seasonStatItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  seasonStatItemPressed: { opacity: 0.55 },
  seasonStatDivider: { width: 1, height: 42, backgroundColor: '#DED4C7' },
  seasonAverageRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  seasonStatValue: { color: '#A74433', fontSize: 25, fontWeight: '800' },
  seasonStatUnit: { color: '#A74433', fontSize: 11, fontWeight: '700' },
  seasonStatLabel: { color: '#74685E', fontSize: 11, fontWeight: '700', marginTop: 3 },
  seasonStatsHint: { color: '#AAA096', fontSize: 9, lineHeight: 14, marginTop: 9, textAlign: 'center' },
  recordList: { backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#E9E0D5', borderRadius: 18, paddingHorizontal: 14 },
  dayAddButton: { height: 50, borderRadius: 15, backgroundColor: '#A74433', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 12 },
  dayAddButtonText: { color: '#FFF9EE', fontSize: 14, fontWeight: '800' },
  periodSectionDivider: { borderTopWidth: 1, borderTopColor: '#E6DACB' },
  periodHeader: { height: 43, flexDirection: 'row', alignItems: 'center', gap: 6 },
  periodTitle: { color: '#594A3E', fontSize: 13, fontWeight: '800' },
  periodCount: { color: '#A0958A', fontSize: 10, marginLeft: 'auto' },
  recordRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center' },
  recordDivider: { borderTopWidth: 1, borderTopColor: '#EFE8DE' },
  timeBadge: { width: 48 },
  timeText: { color: '#998C80', fontSize: 12, fontWeight: '600' },
  recordAvatarImage: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#E7DDD0', marginRight: 12 },
  avatar: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#C9963E', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { color: '#FFF9EE', fontSize: 17, fontWeight: '800' },
  recordNameWrap: { flex: 1 },
  generalNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  generalName: { color: '#352C25', fontSize: 16, fontWeight: '700' },
  generalNameLink: { color: '#A74433', textDecorationLine: 'underline' },
  drawNumberBadge: { color: '#A74433', fontSize: 10, fontWeight: '800', backgroundColor: '#F5E6E1', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden' },
  coreGeneralBadge: { color: '#765514', fontSize: 10, fontWeight: '800', backgroundColor: '#F2DE9D', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden' },
  recruitGeneralBadge: { color: '#2F6938', fontSize: 10, fontWeight: '800', backgroundColor: '#D9EEDB', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden' },
  periodHint: { color: '#A0958A', fontSize: 10, marginTop: 3 },
  recordActionButton: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#F1ECE4', alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  recordDeleteButton: { backgroundColor: '#F8EAE6' },
  overlay: { flex: 1, backgroundColor: 'rgba(29,23,19,.4)' },
  inlineGeneralOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 20 },
  inlineGeneralBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(29,23,19,.32)' },
  inlineGeneralSheet: { height: '82%', backgroundColor: '#F5F1E8', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, paddingBottom: 12, overflow: 'hidden' },
  dismissArea: { flex: 1 },
  sheet: { backgroundColor: '#FAF7F0', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#D6CEC4', alignSelf: 'center', marginBottom: 17 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { color: '#2E261F', fontSize: 22, fontWeight: '800' },
  sheetSeason: { color: '#A74433', fontSize: 11, fontWeight: '600', marginTop: 4 },
  closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ECE6DC', alignItems: 'center', justifyContent: 'center' },
  inputLabel: { color: '#655B52', fontSize: 12, fontWeight: '700', marginBottom: 7, marginTop: 12 },
  input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDD4C8', borderRadius: 13, height: 50, paddingHorizontal: 14, color: '#302820', fontSize: 15 },
  generalSelect: { minHeight: 62, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDD4C8', borderRadius: 15, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  generalSelectChosen: { borderColor: '#C68B7E', backgroundColor: '#FFFDFC' },
  chosenGeneralIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#C9963E', alignItems: 'center', justifyContent: 'center' },
  chosenGeneralIconText: { color: '#FFF9EE', fontSize: 16, fontWeight: '800' },
  generalSelectCopy: { flex: 1 },
  generalSelectValue: { color: '#332A23', fontSize: 15, fontWeight: '800' },
  generalSelectPlaceholder: { color: '#776C62', fontSize: 14, fontWeight: '700' },
  generalSelectHint: { color: '#A59A90', fontSize: 10, marginTop: 3 },
  coreGeneralToggle: { minHeight: 58, marginTop: 11, paddingHorizontal: 12, backgroundColor: '#F7F2E9', borderWidth: 1, borderColor: '#E2D8C9', borderRadius: 14, flexDirection: 'row', alignItems: 'center' },
  coreGeneralToggleActive: { backgroundColor: '#FFF7DF', borderColor: '#D4B45F' },
  recruitGeneralToggleActive: { backgroundColor: '#EAF5E9', borderColor: '#82AF83' },
  coreGeneralIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#ECE3D7', alignItems: 'center', justifyContent: 'center' },
  coreGeneralIconActive: { backgroundColor: '#B58A2C' },
  coreGeneralCopy: { flex: 1, marginLeft: 11 },
  coreGeneralTitle: { color: '#4A3D31', fontSize: 13, fontWeight: '800' },
  coreGeneralHint: { color: '#9A8D81', fontSize: 9, marginTop: 3 },
  coreGeneralStatus: { minWidth: 48, height: 27, paddingHorizontal: 9, borderRadius: 9, backgroundColor: '#E8E0D5', alignItems: 'center', justifyContent: 'center' },
  coreGeneralStatusActive: { backgroundColor: '#D4AC4D' },
  recruitGeneralStatusActive: { backgroundColor: '#4F8A52' },
  coreGeneralStatusText: { color: '#817469', fontSize: 10, fontWeight: '800' },
  coreGeneralStatusTextActive: { color: '#FFF9E9' },
  drawNumberInputWrap: { height: 50, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDD4C8', borderRadius: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  drawNumberPrefix: { color: '#75695F', fontSize: 14, fontWeight: '700' },
  drawNumberInput: { flex: 1, height: 48, paddingHorizontal: 10, color: '#302820', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  drawNumberSuffix: { color: '#75695F', fontSize: 14, fontWeight: '700' },
  keyboardToolbar: { height: 44, paddingHorizontal: 14, backgroundColor: '#F4EFE7', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D5CBC0', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  keyboardDoneButton: { minWidth: 58, height: 32, borderRadius: 10, backgroundColor: '#A74433', alignItems: 'center', justifyContent: 'center' },
  keyboardDoneText: { color: '#FFF9EE', fontSize: 14, fontWeight: '800' },
  pickerWrap: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E1D9CF', borderRadius: 16, overflow: 'hidden' },
  picker: { height: 142 },
  submit: { backgroundColor: '#A74433', height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: '#FFF9EE', fontSize: 16, fontWeight: '800' },
  pickerSafe: { flex: 1, backgroundColor: '#F5F1E8' },
  generalPickerHeader: { height: 62, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E6DED3' },
  generalPickerClose: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EAE3D8', alignItems: 'center', justifyContent: 'center' },
  generalPickerTitleWrap: { alignItems: 'center' },
  generalPickerTitle: { color: '#302820', fontSize: 17, fontWeight: '800' },
  generalPickerMeta: { color: '#9A8E83', fontSize: 10, marginTop: 2 },
  generalSearch: { height: 48, marginHorizontal: 18, marginTop: 16, paddingHorizontal: 13, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#E2D9CD', borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  generalSearchInput: { flex: 1, height: 46, color: '#322A23', fontSize: 15 },
  factionFilterScroll: { height: 45, flexGrow: 0, flexShrink: 0 },
  factionFilterRow: { height: 45, paddingHorizontal: 18, gap: 7, alignItems: 'center' },
  factionChip: { minWidth: 45, height: 30, paddingHorizontal: 13, borderRadius: 10, backgroundColor: '#EAE3D8', alignItems: 'center', justifyContent: 'center' },
  factionChipActive: { backgroundColor: '#A74433' },
  factionChipText: { color: '#70645A', fontSize: 11, fontWeight: '800' },
  factionChipTextActive: { color: '#FFF9EE' },
  manualGeneralOption: { minHeight: 66, marginHorizontal: 18, marginTop: 10, paddingHorizontal: 11, backgroundColor: '#FFF8F4', borderWidth: 1, borderColor: '#C98F82', borderRadius: 16, flexDirection: 'row', alignItems: 'center' },
  manualGeneralIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#A74433', alignItems: 'center', justifyContent: 'center' },
  manualGeneralTitle: { color: '#8E382B', fontSize: 15, fontWeight: '800' },
  generalResultMeta: { color: '#8D8176', fontSize: 11, fontWeight: '600', marginHorizontal: 20, marginTop: 13, marginBottom: 8 },
  generalList: { paddingHorizontal: 15, paddingTop: 7, paddingBottom: 30 },
  generalGridRow: { alignItems: 'flex-start' },
  generalCard: { width: '16.666%', height: 67, paddingTop: 4, borderWidth: 1, borderColor: 'transparent', borderRadius: 10, alignItems: 'center', position: 'relative' },
  generalCardSelected: { borderColor: '#C98F82', backgroundColor: '#FFF0EA' },
  generalCardImage: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#E8E0D5' },
  generalCardFallback: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#C9963E', alignItems: 'center', justifyContent: 'center' },
  generalCardFallbackText: { color: '#FFF9EE', fontSize: 15, fontWeight: '800' },
  generalCardName: { width: '100%', paddingHorizontal: 2, color: '#4A3D33', fontSize: 8, fontWeight: '800', lineHeight: 11, marginTop: 3, textAlign: 'center' },
  generalCardCheck: { position: 'absolute', top: 0, right: 2, width: 16, height: 16, borderRadius: 8, backgroundColor: '#A74433', borderWidth: 1.5, borderColor: '#FFF9EE', alignItems: 'center', justifyContent: 'center' },
  generalOption: { minHeight: 70, marginBottom: 8, paddingHorizontal: 11, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#E8DFD3', borderRadius: 16, flexDirection: 'row', alignItems: 'center' },
  generalOptionSelected: { borderColor: '#C58B7D', backgroundColor: '#FFF8F4' },
  generalOptionImage: { width: 48, height: 48, borderRadius: 13, backgroundColor: '#E8E0D5' },
  generalOptionFallback: { width: 48, height: 48, borderRadius: 13, backgroundColor: '#C9963E', alignItems: 'center', justifyContent: 'center' },
  generalOptionFallbackText: { color: '#FFF9EE', fontSize: 19, fontWeight: '800' },
  generalOptionCopy: { flex: 1, marginLeft: 12 },
  generalOptionName: { color: '#352C25', fontSize: 16, fontWeight: '800' },
  generalOptionFaction: { color: '#9B8F84', fontSize: 10, marginTop: 4 },
  generalEmpty: { alignItems: 'center', justifyContent: 'center', paddingTop: 90 },
  generalEmptyTitle: { color: '#5C5047', fontSize: 15, fontWeight: '700', marginTop: 12 },
  generalEmptyText: { color: '#A3988E', fontSize: 11, marginTop: 5 },
  seasonSheet: { maxHeight: '78%', backgroundColor: '#FAF7F0', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 26 },
  seasonDrawListSheet: { height: '72%', backgroundColor: '#FAF7F0', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 26 },
  seasonDrawListScroll: { flex: 1 },
  seasonDrawListEmpty: { alignItems: 'center', justifyContent: 'center', paddingTop: 90 },
  seasonDrawListRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center' },
  seasonDrawListRowPressed: { opacity: 0.55 },
  seasonDrawOrderBadge: { width: 26, height: 26, borderRadius: 9, backgroundColor: '#EEE5DA', alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  seasonDrawOrderText: { color: '#8B7D71', fontSize: 10, fontWeight: '800' },
  seasonDrawAvatar: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#E8E0D5' },
  seasonDrawAvatarFallback: { backgroundColor: '#C9963E', alignItems: 'center', justifyContent: 'center' },
  seasonDrawAvatarText: { color: '#FFF9EE', fontSize: 18, fontWeight: '800' },
  seasonDrawListCopy: { flex: 1, marginLeft: 12 },
  seasonDrawListName: { color: '#352C25', fontSize: 16, fontWeight: '800' },
  seasonDrawListNameLink: { color: '#A74433' },
  seasonDrawListTime: { color: '#998D82', fontSize: 10, marginTop: 5 },
  addSeasonRow: { flexDirection: 'row', gap: 9 },
  seasonNameInput: { flex: 1, height: 50, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDD4C8', borderRadius: 13, paddingHorizontal: 14, color: '#302820', fontSize: 15 },
  addSeasonButton: { width: 88, height: 50, borderRadius: 13, backgroundColor: '#A74433', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  addSeasonButtonText: { color: '#FFF9EE', fontSize: 13, fontWeight: '800' },
  seasonManageList: { maxHeight: 300, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#E9E0D5', borderRadius: 16, paddingHorizontal: 13 },
  seasonManageRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center' },
  seasonManageRowDragging: { zIndex: 20, elevation: 8, backgroundColor: '#FFF9EE', borderRadius: 12, shadowColor: '#5F4937', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
  seasonManageSelect: { flex: 1, minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11 },
  seasonManageIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#F1E9DF', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  seasonManageIconActive: { backgroundColor: '#A74433' },
  seasonManageName: { color: '#352C25', fontSize: 15, fontWeight: '800' },
  seasonManageCount: { color: '#9E9287', fontSize: 10, marginTop: 3 },
  seasonListLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seasonDragHint: { color: '#A0958A', fontSize: 10, marginTop: 12, marginBottom: 7 },
  seasonDragHandle: { width: 38, height: 38, marginRight: 7, borderRadius: 12, backgroundColor: '#EEE7DD', alignItems: 'center', justifyContent: 'center' },
  seasonDragHandleActive: { backgroundColor: '#A74433' },
  deleteSeasonButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F8EAE6', alignItems: 'center', justifyContent: 'center' },
  dayDetailSheet: { height: '72%', backgroundColor: '#FAF7F0', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 26, overflow: 'hidden' },
  dayInlineGeneralSheet: { height: '100%', borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  dayDetailScroll: { maxHeight: 430 },
  dataSheet: { backgroundColor: '#FAF7F0', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
  dataActionCard: { minHeight: 82, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#E6DDD1', borderRadius: 17, paddingHorizontal: 13, marginTop: 10, flexDirection: 'row', alignItems: 'center' },
  dataActionIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#F2E7DF', alignItems: 'center', justifyContent: 'center' },
  dataActionCopy: { flex: 1, marginHorizontal: 12 },
  dataActionTitle: { color: '#352C25', fontSize: 15, fontWeight: '800' },
  dataActionText: { color: '#94887D', fontSize: 10, lineHeight: 15, marginTop: 4 },
  dataBusyText: { color: '#A74433', fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 13 },
  dataSafetyNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 17 },
  dataSafetyText: { color: '#8C7E72', fontSize: 10 },
});
