import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useCoreServices } from '../../../core/CoreServicesContext';
import type { Answer, Question, QuestionnaireResult, QuestionTimestamp } from '../../../types';
import type { NodeProps } from '../types';
import { QuestionRenderer } from './questionnaire/QuestionRenderer';
import { evaluateBranchingLogic } from './questionnaire/branchingLogic';
import { fontFamily, cardShadow } from '../../../theme/theme';

const ON_PRIMARY = '#FFFFFF';

/**
 * Full questionnaire component supporting REDCap-format questions.
 *
 * Can receive questions in three ways:
 *   1. `node.assessmentName` — fetched from QuestionnaireDataService
 *   2. `node.questions` — inline REDCap Question[] in the blueprint
 *   3. Falls back to a placeholder if neither is available
 *
 * Features:
 *   - Introduction screen (configurable via `node.startText`)
 *   - Branching logic (REDCap-style conditional question display)
 *   - Progress tracking with visual bar
 *   - Completion screen (configurable via `node.endText`)
 *   - Answer timestamps per question
 *   - Submits QuestionnaireResult via QuestionnaireDataService
 */
export function QuestionnaireNode({ node, context }: NodeProps) {
  const { questionnaireData, eventBus } = useCoreServices();

  const assessmentName = typeof node.assessmentName === 'string' ? node.assessmentName : undefined;
  const title = typeof node.title === 'string' ? node.title : (assessmentName ?? 'Questionnaire');
  const startText = typeof node.startText === 'string' ? node.startText : undefined;
  const endText = typeof node.endText === 'string' ? node.endText : 'Thank you for completing this questionnaire.';
  const showIntro = node.showIntroduction !== false && !!startText;

  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [phase, setPhase] = useState<'intro' | 'questions' | 'done'>(showIntro ? 'intro' : 'questions');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [timestamps, setTimestamps] = useState<Record<string, QuestionTimestamp>>({});
  const questionStartTime = useRef(Date.now());
  const startTimeRef = useRef(Date.now());

  // Load questions
  useEffect(() => {
    (async () => {
      if (assessmentName && questionnaireData) {
        const qs = await questionnaireData.getQuestions(assessmentName);
        if (qs.length > 0) {
          setAllQuestions(qs);
          return;
        }
      }
      // Fallback: inline questions from blueprint
      if (Array.isArray(node.questions)) {
        setAllQuestions(node.questions as Question[]);
      }
    })();
  }, [assessmentName, questionnaireData, node.questions]);

  // Compute visible questions (applying branching logic)
  const visibleQuestions = useMemo(
    () => allQuestions.filter(q =>
      evaluateBranchingLogic(q.branching_logic ?? q.evaluated_logic, answers),
    ),
    [allQuestions, answers],
  );

  const currentQuestion = visibleQuestions[currentIndex];
  const total = visibleQuestions.length;
  const answeredCount = visibleQuestions.filter(q => q.field_name && answers[q.field_name] != null).length;
  const progress = total === 0 ? 0 : Math.round((answeredCount / total) * 100);

  // Emit progress
  useEffect(() => {
    context.eventBus?.emit('questionnaire-progress', {
      nodeId: node.id,
      answered: answeredCount,
      total,
      progress,
    });
  }, [answeredCount, total, progress, context.eventBus, node.id]);

  const handleAnswer = useCallback((value: any) => {
    if (!currentQuestion?.field_name) return;
    const fieldName = currentQuestion.field_name;
    const now = Date.now();

    setAnswers(prev => ({ ...prev, [fieldName]: value }));
    setTimestamps(prev => ({
      ...prev,
      [fieldName]: { startTime: questionStartTime.current, endTime: now },
    }));
  }, [currentQuestion]);

  const goNext = useCallback(() => {
    // Record timestamp for info/descriptive types (no user input)
    if (currentQuestion?.field_name && timestamps[currentQuestion.field_name] == null) {
      const now = Date.now();
      setTimestamps(prev => ({
        ...prev,
        [currentQuestion.field_name!]: { startTime: questionStartTime.current, endTime: now },
      }));
    }

    if (currentIndex < total - 1) {
      setCurrentIndex(currentIndex + 1);
      questionStartTime.current = Date.now();
    } else {
      // Finish
      setPhase('done');
      submitResult();
    }
  }, [currentIndex, total, currentQuestion, timestamps]);

  const goPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      questionStartTime.current = Date.now();
    }
  }, [currentIndex]);

  const submitResult = useCallback(async () => {
    if (!questionnaireData) return;
    const result: QuestionnaireResult = {
      assessmentName: assessmentName ?? title,
      answers,
      timestamps,
      startTime: startTimeRef.current,
      endTime: Date.now(),
    };
    try {
      await questionnaireData.submitResult(result);
    } catch {
      // Fire event even if service fails
      eventBus.emit('questionnaireCompleted', result);
    }
  }, [questionnaireData, assessmentName, title, answers, timestamps, eventBus]);

  const theme = context.theme;
  const primary = theme.primaryColor;
  const surface = theme.surfaceColor ?? '#FFFFFF';
  const text = theme.textColor ?? '#000';
  const textSecondary = theme.textSecondaryColor ?? '#6D6D80';
  const radius = theme.button?.borderRadius ?? 8;

  // --- Introduction Screen ---
  if (phase === 'intro') {
    return (
      <View style={[styles.container, { backgroundColor: surface, borderRadius: radius }]}>
        <Text style={[styles.title, { color: text }]}>{title}</Text>
        {startText && <Text style={[styles.introText, { color: textSecondary }]}>{startText}</Text>}
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => {
            setPhase('questions');
            startTimeRef.current = Date.now();
            questionStartTime.current = Date.now();
          }}
          style={[styles.primaryButton, { backgroundColor: primary, borderRadius: radius }]}
        >
          <Text style={styles.primaryButtonText}>Start</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- Completion Screen ---
  if (phase === 'done') {
    return (
      <View style={[styles.container, { backgroundColor: surface, borderRadius: radius }]}>
        <Text style={[styles.title, { color: text }]}>{title}</Text>
        <Text style={[styles.doneText, { color: textSecondary }]}>{endText}</Text>
        <Text style={[styles.doneSubtext, { color: textSecondary }]}>
          {answeredCount} of {total} questions answered
        </Text>
      </View>
    );
  }

  // --- Questions Screen ---
  if (allQuestions.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: surface, borderRadius: radius }]}>
        <Text style={[styles.title, { color: text }]}>{title}</Text>
        <Text style={[styles.emptyText, { color: textSecondary }]}>No questions available</Text>
      </View>
    );
  }

  const isInfoType = currentQuestion?.field_type === 'info' || currentQuestion?.field_type === 'descriptive';
  const hasAnswer = currentQuestion?.field_name ? answers[currentQuestion.field_name] != null : false;
  const isRequired = currentQuestion?.required_field === 'y';
  const canProceed = !isRequired || hasAnswer || isInfoType;

  return (
    <View style={[styles.container, { backgroundColor: surface, borderRadius: radius }]}>
      {/* Progress bar */}
      <View style={styles.progressRow}>
        <Text style={[styles.progressText, { color: textSecondary }]}>
          {currentIndex + 1} / {total}
        </Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: primary }]} />
        </View>
      </View>

      <Text style={[styles.title, { color: text }]}>{title}</Text>

      {/* Current question */}
      <ScrollView style={styles.questionArea} contentContainerStyle={styles.questionContent}>
        {currentQuestion && (
          <QuestionRenderer
            question={currentQuestion}
            value={currentQuestion.field_name ? answers[currentQuestion.field_name] : undefined}
            onChange={handleAnswer}
            primaryColor={primary}
            textColor={text}
            textSecondaryColor={textSecondary}
          />
        )}
      </ScrollView>

      {/* Navigation */}
      <View style={styles.navRow}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Previous question"
          disabled={currentIndex === 0}
          onPress={goPrevious}
          style={[styles.navButton, currentIndex === 0 && styles.navButtonDisabled]}
        >
          <Text style={[styles.navButtonText, { color: currentIndex === 0 ? '#ccc' : primary }]}>
            Previous
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={currentIndex === total - 1 ? 'Finish' : 'Next question'}
          disabled={!canProceed}
          onPress={goNext}
          style={[
            styles.primaryButton,
            { backgroundColor: canProceed ? primary : '#ccc', borderRadius: radius },
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {currentIndex === total - 1 ? 'Finish' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    marginBottom: 16,
    ...cardShadow,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressText: { fontSize: 12, fontWeight: '600', marginRight: 10, fontFamily: fontFamily.semiBold, includeFontPadding: false },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8, fontFamily: fontFamily.bold, includeFontPadding: false },
  introText: { fontSize: 14, lineHeight: 20, marginBottom: 20, fontFamily: fontFamily.regular, includeFontPadding: false },
  doneText: { fontSize: 14, lineHeight: 20, marginBottom: 8, fontFamily: fontFamily.regular, includeFontPadding: false },
  doneSubtext: { fontSize: 12, fontStyle: 'italic', fontFamily: fontFamily.regular, includeFontPadding: false },
  emptyText: { fontSize: 13, fontStyle: 'italic', marginTop: 8, fontFamily: fontFamily.regular, includeFontPadding: false },
  questionArea: { maxHeight: 400 },
  questionContent: { paddingBottom: 8 },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
  },
  navButton: { paddingVertical: 10, paddingHorizontal: 16 },
  navButtonDisabled: { opacity: 0.4 },
  navButtonText: { fontSize: 14, fontWeight: '600', fontFamily: fontFamily.semiBold, includeFontPadding: false },
  primaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  primaryButtonText: {
    color: ON_PRIMARY,
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
    includeFontPadding: false,
    fontWeight: '600',
    textAlign: 'center',
  },
});
