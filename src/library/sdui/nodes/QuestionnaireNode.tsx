import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Question } from '../../../types';
import type { NodeProps } from '../types';

type Presentation = 'card' | 'list' | 'fullPage';

const ON_PRIMARY = '#FFFFFF';

/**
 * Renders an inline or full-page questionnaire form. Questions are declared inline on
 * the node; future iterations will swap this for a `formId` lookup against a
 * questionnaire definitions service (Phase 4). Submission emits a `questionnaire-
 * submitted` event on the SDUI EventBus and shows a confirmation alert.
 */
export function QuestionnaireNode({ node, context }: NodeProps) {
  const questions = extractQuestions(node.questions);
  const title = typeof node.title === 'string' ? node.title : 'Questionnaire';
  const description = typeof node.description === 'string' ? node.description : undefined;
  const presentation: Presentation = isPresentation(node.presentation) ? node.presentation : 'fullPage';
  const isList = presentation === 'list';
  const isFullPage = presentation === 'fullPage';

  const [responses, setResponses] = useState<Record<string, unknown>>({});

  const total = questions.length;
  const answered = questions.filter((q) => responses[q.id] !== undefined && responses[q.id] !== '').length;
  const requiredTotal = questions.filter((q) => q.required).length;
  const requiredAnswered = questions.filter((q) => q.required && responses[q.id]).length;
  const progress = total === 0 ? 0 : Math.round((answered / total) * 100);
  const canSubmit = requiredAnswered === requiredTotal;

  useEffect(() => {
    context.eventBus?.emit('questionnaire-progress', {
      nodeId: node.id,
      answered,
      total,
      requiredAnswered,
      requiredTotal,
      progress,
    });
  }, [answered, total, requiredAnswered, requiredTotal, progress, context.eventBus, node.id]);

  const handleResponse = (questionId: string, value: unknown) => {
    setResponses((prev) => ({ ...prev, [questionId]: value }));
  };

  const submit = () => {
    const incompleteRequired = questions
      .filter((q) => q.required && !responses[q.id])
      .map((q) => q.question);
    if (incompleteRequired.length > 0) {
      Alert.alert('Incomplete', `Please complete: ${incompleteRequired.join(', ')}`);
      return;
    }
    context.eventBus?.emit('questionnaire-submitted', {
      nodeId: node.id,
      responses,
      timestamp: new Date().toISOString(),
    });
    Alert.alert('Questionnaire Submitted', `Thank you for completing ${title}`);
  };

  const theme = context.theme;
  const primary = theme.primaryColor;
  const surface = theme.surfaceColor ?? '#FFFFFF';
  const text = theme.textColor ?? '#000';
  const textSecondary = theme.textSecondaryColor ?? '#6D6D80';
  const radius = theme.button?.borderRadius ?? 8;

  return (
    <View
      style={[
        isFullPage ? styles.containerFull : isList ? styles.containerList : styles.containerCard,
        { backgroundColor: surface, borderRadius: radius },
      ]}
    >
      {!isList && (
        <View style={styles.progressRow}>
          <Text style={[styles.progressText, { color: textSecondary }]}>Progress: {progress}%</Text>
          <View style={[styles.progressBar, { backgroundColor: '#e0e0e0' }]}>
            <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: primary }]} />
          </View>
        </View>
      )}

      <Text style={[styles.title, { color: text }]}>{title}</Text>
      {description && <Text style={[styles.description, { color: textSecondary }]}>{description}</Text>}

      {questions.map((question) => (
        <View key={question.id} style={isList ? styles.rowList : styles.questionContainer}>
          <Text style={[styles.questionText, { color: text }]}>
            {question.question}
            {question.required && <Text style={styles.required}> *</Text>}
          </Text>

          {question.type === 'scale' && question.scale && (
            <View style={styles.scaleContainer}>
              {!isList && (
                <Text style={[styles.scaleLabel, { color: textSecondary }]}>{question.scale.labels[0]}</Text>
              )}
              <View style={styles.scaleButtons}>
                {Array.from({ length: question.scale.max - question.scale.min + 1 }, (_, i) => {
                  const value = question.scale!.min + i;
                  const selected = responses[question.id] === value;
                  return (
                    <TouchableOpacity
                      key={value}
                      onPress={() => handleResponse(question.id, value)}
                      style={[styles.scaleButton, selected && { backgroundColor: primary }]}
                    >
                      <Text style={[styles.scaleButtonText, { color: selected ? ON_PRIMARY : text }]}>
                        {value}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {!isList && (
                <Text style={[styles.scaleLabel, { color: textSecondary }]}>{question.scale.labels[1]}</Text>
              )}
            </View>
          )}

          {question.type === 'number' && (
            <TextInput
              style={[styles.numberInput, { borderColor: '#ccc', color: text }]}
              value={responses[question.id] !== undefined ? String(responses[question.id]) : ''}
              onChangeText={(t) => handleResponse(question.id, parseFloat(t) || 0)}
              keyboardType="numeric"
              placeholder={
                question.min !== undefined && question.max !== undefined
                  ? `Enter value (${question.min}-${question.max})`
                  : 'Enter value'
              }
              placeholderTextColor={textSecondary}
            />
          )}

          {question.type === 'multiple_choice' && question.options && (
            <View style={styles.choicesRow}>
              {question.options.map((option: string) => {
                const selected = responses[question.id] === option;
                return (
                  <TouchableOpacity
                    key={option}
                    onPress={() => handleResponse(question.id, option)}
                    style={[styles.choiceButton, selected && { backgroundColor: primary }]}
                  >
                    <Text style={[styles.choiceButtonText, { color: selected ? ON_PRIMARY : text }]}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {question.type === 'text' && (
            <TextInput
              style={[styles.textInput, { borderColor: '#ccc', color: text }]}
              value={typeof responses[question.id] === 'string' ? (responses[question.id] as string) : ''}
              onChangeText={(t) => handleResponse(question.id, t)}
              placeholder="Enter your response"
              placeholderTextColor={textSecondary}
              multiline={!isList}
            />
          )}
        </View>
      ))}

      <TouchableOpacity
        disabled={!canSubmit}
        onPress={submit}
        style={[
          styles.submitButton,
          { backgroundColor: primary, borderRadius: radius, opacity: canSubmit ? 1 : 0.5 },
        ]}
      >
        <Text style={[styles.submitButtonText, { color: ON_PRIMARY }]}>
          {canSubmit ? 'Submit Responses' : `Complete required (${requiredAnswered}/${requiredTotal})`}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function extractQuestions(value: unknown): Question[] {
  if (!Array.isArray(value)) return [];
  return value.filter((q): q is Question => isQuestion(q));
}

function isQuestion(value: unknown): value is Question {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.id === 'string' && typeof obj.question === 'string';
}

function isPresentation(value: unknown): value is Presentation {
  return value === 'card' || value === 'list' || value === 'fullPage';
}

const styles = StyleSheet.create({
  containerCard: { padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#eee' },
  containerList: { padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#eee' },
  containerFull: { padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#eee' },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  progressText: { fontSize: 12, marginRight: 10, fontWeight: '600' },
  progressBar: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%' },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  description: { fontSize: 12, marginBottom: 10 },
  questionContainer: { marginBottom: 18 },
  rowList: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0' },
  questionText: { fontSize: 14, fontWeight: '500', marginBottom: 6 },
  required: { color: '#ff3b30' },
  scaleContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  scaleLabel: { fontSize: 12, marginHorizontal: 5, flex: 1 },
  scaleButtons: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e0e0e0', borderRadius: 8, padding: 2, flex: 2 },
  scaleButton: { flex: 1, paddingVertical: 5, borderRadius: 5, marginHorizontal: 2, backgroundColor: '#f0f0f0', alignItems: 'center' },
  scaleButtonText: { fontSize: 14, fontWeight: '600' },
  numberInput: { height: 48, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, fontSize: 15, backgroundColor: 'white' },
  textInput: { minHeight: 88, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 15, backgroundColor: 'white', textAlignVertical: 'top' },
  choicesRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 5 },
  choiceButton: { backgroundColor: '#e0e0e0', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, marginHorizontal: 5, marginVertical: 5 },
  choiceButtonText: { fontSize: 14, fontWeight: '600' },
  submitButton: { paddingHorizontal: 30, paddingVertical: 14, marginTop: 16, alignSelf: 'flex-end' },
  submitButtonText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
