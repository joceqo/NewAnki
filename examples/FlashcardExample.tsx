import React from 'react';
import { YStack, XStack, Button, Card, H2, Paragraph, Input, Theme } from 'tamagui';

/**
 * Example component demonstrating Tamagui theme usage in the flashcard app
 *
 * This component showcases:
 * - Custom blue-based color scheme
 * - Light/dark mode support
 * - Semantic color usage (success, warning, error)
 * - Component theming (Card, Button, Input)
 * - Consistent spacing with 4px base scale
 */

export function FlashcardExample() {
  const [answer, setAnswer] = React.useState('');
  const [showAnswer, setShowAnswer] = React.useState(false);

  return (
    <YStack flex={1} backgroundColor="$background" padding="$4" gap="$4">
      {/* Header */}
      <H2 color="$color">Spaced Repetition Study</H2>

      {/* Flashcard - uses Card theme */}
      <Card
        elevate
        bordered
        animation="bouncy"
        size="$4"
        padding="$6"
        gap="$4"
        pressStyle={{ scale: 0.98 }}
      >
        <YStack gap="$3">
          {/* Question */}
          <Paragraph color="$colorMuted" fontSize="$2">
            Question
          </Paragraph>
          <H2 color="$color">What is the FSRS algorithm?</H2>

          {/* Answer (revealed) */}
          {showAnswer && (
            <YStack
              gap="$2"
              padding="$4"
              backgroundColor="$successBackground"
              borderColor="$successBorder"
              borderWidth={1}
              borderRadius="$4"
            >
              <Paragraph color="$colorMuted" fontSize="$2">
                Answer
              </Paragraph>
              <Paragraph color="$color">
                Free Spaced Repetition Scheduler - an algorithm that optimizes
                review intervals, reducing reviews by 20-30% vs SM-2.
              </Paragraph>
            </YStack>
          )}
        </YStack>
      </Card>

      {/* Action Buttons */}
      <XStack gap="$3" justifyContent="center">
        {!showAnswer ? (
          <Button
            theme="Button"
            size="$4"
            onPress={() => setShowAnswer(true)}
            backgroundColor="$primary"
            color="$white"
            pressStyle={{ backgroundColor: '$primaryPress' }}
          >
            Show Answer
          </Button>
        ) : (
          <>
            {/* Again - uses error color but sparingly */}
            <Button
              size="$4"
              backgroundColor="$error"
              color="$white"
              pressStyle={{ backgroundColor: '$errorPress' }}
              flex={1}
            >
              Again
            </Button>

            {/* Hard - uses warning color */}
            <Button
              size="$4"
              backgroundColor="$warning"
              color="$white"
              pressStyle={{ backgroundColor: '$warningPress' }}
              flex={1}
            >
              Hard
            </Button>

            {/* Good - uses accent (teal/green) for success */}
            <Button
              size="$4"
              backgroundColor="$accent"
              color="$white"
              pressStyle={{ backgroundColor: '$accentPress' }}
              flex={1}
            >
              Good
            </Button>

            {/* Easy - uses primary blue */}
            <Button
              size="$4"
              backgroundColor="$primary"
              color="$white"
              pressStyle={{ backgroundColor: '$primaryPress' }}
              flex={1}
            >
              Easy
            </Button>
          </>
        )}
      </XStack>

      {/* Quick Add Card Section */}
      <Card bordered padding="$4" gap="$3">
        <H2 fontSize="$5" color="$color">
          Quick Add
        </H2>

        <Input
          theme="Input"
          placeholder="Enter question..."
          placeholderTextColor="$placeholderColor"
          borderColor="$borderColor"
          focusStyle={{
            borderColor: '$borderColorFocus',
            borderWidth: 2,
          }}
          size="$4"
        />

        <Input
          theme="Input"
          placeholder="Enter answer..."
          placeholderTextColor="$placeholderColor"
          borderColor="$borderColor"
          focusStyle={{
            borderColor: '$borderColorFocus',
            borderWidth: 2,
          }}
          size="$4"
          value={answer}
          onChangeText={setAnswer}
        />

        <Button
          theme="Button"
          size="$4"
          backgroundColor="$accent"
          color="$white"
          pressStyle={{ backgroundColor: '$accentPress' }}
        >
          Add Card
        </Button>
      </Card>

      {/* Stats Cards with spacing scale demo */}
      <XStack gap="$3">
        <Card flex={1} padding="$3" backgroundColor="$surface">
          <Paragraph color="$colorMuted" fontSize="$2">
            Due Today
          </Paragraph>
          <H2 color="$primary">24</H2>
        </Card>

        <Card flex={1} padding="$3" backgroundColor="$surface">
          <Paragraph color="$colorMuted" fontSize="$2">
            Streak
          </Paragraph>
          <H2 color="$accent">7 days</H2>
        </Card>

        <Card flex={1} padding="$3" backgroundColor="$surface">
          <Paragraph color="$colorMuted" fontSize="$2">
            Total Cards
          </Paragraph>
          <H2 color="$color">156</H2>
        </Card>
      </XStack>

      {/* Theme tokens usage examples */}
      <Card bordered padding="$4" gap="$2">
        <Paragraph color="$colorMuted" fontSize="$1">
          Theme Tokens Demo:
        </Paragraph>
        <Paragraph color="$color">Default text color</Paragraph>
        <Paragraph color="$colorMuted">Muted text color</Paragraph>
        <Paragraph color="$colorSubtle">Subtle text color</Paragraph>
        <Paragraph color="$primary">Primary blue color</Paragraph>
        <Paragraph color="$accent">Accent teal/green color</Paragraph>
      </Card>
    </YStack>
  );
}

/**
 * Usage with theme switching:
 *
 * import { TamaguiProvider, Theme } from 'tamagui';
 * import config from './tamagui.config';
 *
 * function App() {
 *   const [theme, setTheme] = useState('light');
 *
 *   return (
 *     <TamaguiProvider config={config}>
 *       <Theme name={theme}>
 *         <FlashcardExample />
 *       </Theme>
 *     </TamaguiProvider>
 *   );
 * }
 *
 * Color scheme highlights:
 * - Primary: Blue (#3B82F6) - Focus, intelligence, learning
 * - Accent: Teal/Green (#10B981) - Success, growth, progress
 * - Red minimized to avoid Anki association
 * - Spacing: 4px base scale for consistency
 * - Component themes for Card, Button, Input
 */
